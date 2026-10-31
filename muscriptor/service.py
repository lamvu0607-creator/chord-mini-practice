"""MuScriptor multi-instrument transcription runtime (GPU).

Weights: MuScriptor/muscriptor-medium (gated, CC BY-NC 4.0), mounted at MUSCRIPTOR_CKPT_DIR.
Code: muscriptor/muscriptor (MIT), pinned in requirements.txt. Only `transcribe()` is used: greedy
decoding over 5 s chunks, continuous note times at 10 ms resolution, no quantization.
"""

import hashlib
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import soundfile as sf
import torch

logger = logging.getLogger(__name__)

CKPT_DIR = Path(os.getenv("MUSCRIPTOR_CKPT_DIR", str(Path(__file__).resolve().parent / "ckpts"))).resolve()
REPO_ID = "MuScriptor/muscriptor-medium"
REVISION = "f32236969308476e01fd3aae67357de5feb05a2d"
MODEL_DIR_NAME = "muscriptor-medium"
MODEL_LABEL = f"muscriptor-medium@{REVISION[:7]}"
FILES = {
    "model.safetensors": "ac80adbdf85d87231735fd948af7013441c0afced316c4e9067fd5d8a7fb97ec",
    "config.json": "43e13a70fc9ae0af36b7447c06f3eac2282daeb69d79c1ff840ede7fdaa26a3b",
}


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class MuscriptorRuntime:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model = None
        wants_gpu = os.getenv("MUSCRIPTOR_DEVICE", "cuda").strip().lower() != "cpu"
        self.device = "cuda" if wants_gpu and torch.cuda.is_available() else "cpu"

    @property
    def model_dir(self) -> Path:
        return CKPT_DIR / MODEL_DIR_NAME

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def info(self) -> Dict[str, Any]:
        info: Dict[str, Any] = {
            "model": MODEL_LABEL,
            "device": self.device,
            "loaded": self.is_loaded,
            "weightsPresent": all((self.model_dir / name).is_file() for name in FILES),
        }
        if self.device == "cuda":
            info["gpu"] = torch.cuda.get_device_name(0)
        return info

    def ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return
            missing = [name for name in FILES if not (self.model_dir / name).is_file()]
            if missing:
                raise FileNotFoundError(
                    f"MuScriptor weights missing in {self.model_dir} ({', '.join(missing)}). "
                    "Run muscriptor/download_weights.py on the host (needs a Hugging Face login)."
                )
            from muscriptor import TranscriptionModel

            started = time.perf_counter()
            self._model = TranscriptionModel.load_model(
                str(self.model_dir / "model.safetensors"), device=self.device, dtype="float32"
            )
            logger.info("Loaded MuScriptor medium on %s in %.1fs", self.device, time.perf_counter() - started)

    def transcribe(self, input_path: Path, progress: Optional[Callable[[float], None]] = None) -> Dict[str, Any]:
        from muscriptor.events import NoteEndEvent, ProgressEvent

        self.ensure_loaded()
        started = time.perf_counter()
        audio, sample_rate = sf.read(str(input_path), dtype="float32", always_2d=True)
        wav = torch.from_numpy(audio.T.copy())
        duration = audio.shape[0] / sample_rate

        notes: List[Dict[str, Any]] = []
        with self._lock:
            try:
                for event in self._model.transcribe((wav, sample_rate)):
                    if isinstance(event, ProgressEvent):
                        if progress and event.total:
                            progress(min(1.0, event.completed / event.total))
                    elif isinstance(event, NoteEndEvent) and event.start_event.instrument != "drums":
                        start = event.start_event
                        notes.append({
                            "onset": round(float(start.start_time), 3),
                            "offset": round(float(max(event.end_time, start.start_time)), 3),
                            "pitch": int(start.pitch),
                            "instrument": start.instrument,
                        })
            finally:
                if self.device == "cuda":
                    torch.cuda.empty_cache()

        notes.sort(key=lambda note: (note["onset"], note["pitch"]))
        elapsed = time.perf_counter() - started
        logger.info("Transcribed %s (%.0fs audio) into %d notes in %.1fs", input_path.name, duration, len(notes), elapsed)
        return {
            "model": MODEL_LABEL,
            "duration": round(duration, 3),
            "processingTime": round(elapsed, 3),
            "device": self.device,
            "notes": notes,
        }
