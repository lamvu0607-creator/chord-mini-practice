"""SCNet stem separation runtime.

Model code is vendored from ZFTurbo/Music-Source-Separation-Training (MIT, see
scnet/LICENSE). The overlap-add inference loop below follows that repo's
utils.model_utils.demix "generic" mode.
"""

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import librosa
import numpy as np
import soundfile as sf
import torch
import torch.nn as nn

from scnet import SCNet

logger = logging.getLogger(__name__)

CKPT_DIR = Path(os.getenv("STEMS_CKPT_DIR", str(Path(__file__).resolve().parent / "ckpts"))).resolve()
RELEASES = "https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/download"


@dataclass(frozen=True)
class ModelSpec:
    name: str
    label: str
    checkpoint: str
    url: str
    sha256: str
    model_kwargs: Dict[str, Any]
    batch_size: int
    normalize: bool
    sample_rate: int = 44100
    chunk_size: int = 44100 * 11
    sources: List[str] = field(default_factory=lambda: ["drums", "bass", "other", "vocals"])


MODELS: Dict[str, ModelSpec] = {
    "scnet_xl_ihf": ModelSpec(
        name="scnet_xl_ihf",
        label="SCNet XL IHF (MUSDB18HQ, SDR 10.08)",
        checkpoint="model_scnet_ep_36_sdr_10.0891.ckpt",
        url=f"{RELEASES}/v1.0.15/model_scnet_ep_36_sdr_10.0891.ckpt",
        sha256="ac25975f0f5704f3d1a3c3c251505b7a0f417a22eafe82773440ee4f7e14b74f",
        model_kwargs=dict(
            dims=[4, 64, 128, 256],
            band_SR=[0.230, 0.370, 0.400],
            band_stride=[1, 4, 4],
            band_kernel=[3, 4, 4],
            conv_depths=[3, 3, 3],
            num_dplayer=8,
        ),
        batch_size=4,
        normalize=False,
    ),
    "scnet_small": ModelSpec(
        name="scnet_small",
        label="SCNet Small (MUSDB18HQ, SDR 9.03)",
        checkpoint="scnet_checkpoint_musdb18.ckpt",
        url=f"{RELEASES}/v.1.0.6/scnet_checkpoint_musdb18.ckpt",
        sha256="1bc0d1abb20bfdf966dcd07637bafd03e4bc13653d09ef18bc9b3e342eafe2aa",
        model_kwargs=dict(
            dims=[4, 32, 64, 128],
            band_SR=[0.175, 0.392, 0.433],
            band_stride=[1, 4, 16],
            band_kernel=[3, 4, 16],
            conv_depths=[3, 2, 1],
            num_dplayer=6,
        ),
        batch_size=8,
        normalize=True,
    ),
}

DEFAULT_MODEL = "scnet_xl_ihf"

# Chunks overlap by 1/num_overlap. The upstream configs use 4; 2 is ~2.3x faster on GPU and
# measured within -26 dB of the 4-overlap output, which is inaudible for practice use.
DEFAULT_OVERLAP = 2


def _windowing_array(window_size: int, fade_size: int) -> torch.Tensor:
    window = torch.ones(window_size)
    window[-fade_size:] = torch.linspace(1, 0, fade_size)
    window[:fade_size] = torch.linspace(0, 1, fade_size)
    return window


class StemRuntime:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model: Optional[nn.Module] = None
        self._spec: Optional[ModelSpec] = None
        requested = os.getenv("STEMS_MODEL", DEFAULT_MODEL).strip().lower()
        self.requested_model = requested if requested in MODELS else DEFAULT_MODEL
        wants_gpu = os.getenv("STEMS_DEVICE", "cuda").strip().lower() != "cpu"
        self.device = torch.device("cuda" if wants_gpu and torch.cuda.is_available() else "cpu")
        try:
            self.num_overlap = max(1, int(os.getenv("STEMS_OVERLAP", str(DEFAULT_OVERLAP))))
        except ValueError:
            self.num_overlap = DEFAULT_OVERLAP

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def spec(self) -> ModelSpec:
        return self._spec or MODELS[self.requested_model]

    def available_models(self) -> List[Dict[str, Any]]:
        return [
            {"name": spec.name, "label": spec.label, "present": (CKPT_DIR / spec.checkpoint).is_file()}
            for spec in MODELS.values()
        ]

    def info(self) -> Dict[str, Any]:
        info: Dict[str, Any] = {
            "model": self.spec.name,
            "modelLabel": self.spec.label,
            "stems": self.spec.sources,
            "sampleRate": self.spec.sample_rate,
            "device": str(self.device),
            "loaded": self.is_loaded,
            "overlap": self.num_overlap,
            "models": self.available_models(),
        }
        if self.device.type == "cuda":
            info["gpu"] = torch.cuda.get_device_name(self.device)
        return info

    def ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return
            spec = MODELS[self.requested_model]
            checkpoint_path = CKPT_DIR / spec.checkpoint
            if not checkpoint_path.is_file():
                raise FileNotFoundError(
                    f"Missing checkpoint {checkpoint_path}. Run `python download_weights.py --model {spec.name}`."
                )
            started = time.perf_counter()
            model = SCNet(sources=spec.sources, **spec.model_kwargs)
            state = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
            for key in ("state", "state_dict", "model_state_dict"):
                if isinstance(state, dict) and key in state:
                    state = state[key]
            model.load_state_dict(state)
            model.to(self.device).eval()
            self._model = model
            self._spec = spec
            logger.info("Loaded %s on %s in %.1fs", spec.name, self.device, time.perf_counter() - started)

    def _demix(self, mix: np.ndarray, progress: Optional[Callable[[float], None]]) -> np.ndarray:
        """Overlap-add chunked inference. mix: (channels, samples) -> (sources, channels, samples)."""
        spec = self.spec
        model = self._model
        assert model is not None

        chunk_size = spec.chunk_size
        step = chunk_size // self.num_overlap
        fade_size = chunk_size // 10
        border = chunk_size - step

        mix_t = torch.tensor(mix, dtype=torch.float32)
        length_init = mix_t.shape[-1]
        if length_init > 2 * border and border > 0:
            mix_t = nn.functional.pad(mix_t, (border, border), mode="reflect")

        total = mix_t.shape[-1]
        result = torch.zeros((len(spec.sources),) + tuple(mix_t.shape), dtype=torch.float32)
        counter = torch.zeros(total, dtype=torch.float32)
        base_window = _windowing_array(chunk_size, fade_size)
        use_amp = self.device.type == "cuda"

        batch: List[torch.Tensor] = []
        locations: List[tuple] = []
        i = 0
        with torch.autocast(device_type=self.device.type, enabled=use_amp), torch.inference_mode():
            while i < total:
                part = mix_t[:, i:i + chunk_size]
                chunk_len = part.shape[-1]
                pad_mode = "reflect" if chunk_len > chunk_size // 2 else "constant"
                part = nn.functional.pad(part, (0, chunk_size - chunk_len), mode=pad_mode)
                batch.append(part)
                locations.append((i, chunk_len))
                i += step

                if len(batch) >= spec.batch_size or i >= total:
                    out = model(torch.stack(batch).to(self.device)).float().cpu()
                    window = base_window.clone()
                    if i - step == 0:
                        window[:fade_size] = 1
                    elif i >= total:
                        window[-fade_size:] = 1
                    for j, (start, seg_len) in enumerate(locations):
                        result[..., start:start + seg_len] += out[j, ..., :seg_len] * window[:seg_len]
                        counter[start:start + seg_len] += window[:seg_len]
                    batch.clear()
                    locations.clear()
                    if progress:
                        progress(min(1.0, i / total))

        estimated = result.div_(counter)
        if length_init > 2 * border and border > 0:
            estimated = estimated[..., border:-border]
        return np.nan_to_num(estimated.numpy(), copy=False, nan=0.0)

    def separate(
        self,
        input_path: Path,
        output_dir: Path,
        progress: Optional[Callable[[float], None]] = None,
    ) -> Dict[str, Any]:
        self.ensure_loaded()
        spec = self.spec
        started = time.perf_counter()

        mix, _ = librosa.load(str(input_path), sr=spec.sample_rate, mono=False)
        if mix.ndim == 1:
            mix = np.stack([mix, mix])
        mix = mix[:2]
        duration = mix.shape[-1] / spec.sample_rate

        norm = None
        if spec.normalize:
            mono = mix.mean(0)
            norm = (float(mono.mean()), float(mono.std()) or 1.0)
            mix = (mix - norm[0]) / norm[1]

        with self._lock:
            estimates = self._demix(mix, progress)
            if self.device.type == "cuda":
                torch.cuda.empty_cache()

        if norm is not None:
            estimates = estimates * norm[1] + norm[0]

        output_dir.mkdir(parents=True, exist_ok=True)
        stems = []
        for name, audio in zip(spec.sources, estimates):
            target = output_dir / f"{name}.flac"
            temporary = output_dir / f".{name}.flac.tmp"
            sf.write(str(temporary), np.clip(audio.T, -1.0, 1.0), spec.sample_rate, format="FLAC", subtype="PCM_16")
            os.replace(temporary, target)
            stems.append({"name": name, "file": target.name, "bytes": target.stat().st_size})

        elapsed = time.perf_counter() - started
        logger.info("Separated %s (%.0fs audio) in %.1fs", input_path.name, duration, elapsed)
        return {
            "model": spec.name,
            "modelLabel": spec.label,
            "sampleRate": spec.sample_rate,
            "duration": round(duration, 3),
            "processingTime": round(elapsed, 3),
            "device": str(self.device),
            "stems": stems,
        }
