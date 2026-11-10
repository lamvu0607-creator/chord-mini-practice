"""
Beat This! detector service.

Wraps CPJKU "Beat This!" (Foscarin, Schlüter & Widmer, ISMIR 2024;
https://github.com/CPJKU/beat_this, MIT licence for code and weights).
Unlike madmom it tracks real downbeats, and unlike Beat-Transformer it needs
no source separation. The model does not report tempo or meter, so both are
derived here: BPM from the median beat interval, beats-per-bar from the most
common number of beats between consecutive downbeats.

Environment:
    BEAT_THIS_CHECKPOINT  checkpoint name or local path (default "final0")
    BEAT_THIS_DBN         true to use madmom's DBN post-processing (default false)
    BEAT_THIS_FP16        true to run in half precision on CUDA (default false)
"""

import os
import threading
import time
from collections import Counter
from typing import Any, Dict, List, Optional

import numpy as np

from utils.logging import log_debug, log_error, log_info

MODEL_ID = "beat-this"


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name, "").strip().lower()
    if not value:
        return default
    return value in ("1", "true", "yes", "on")


def beats_per_bar(beats: List[float], downbeats: List[float]) -> Optional[int]:
    """Most common number of beats between consecutive downbeats (2..12), or None."""
    if len(downbeats) < 2 or len(beats) < 2:
        return None
    beats_arr = np.asarray(beats)
    idx = np.searchsorted(beats_arr, np.asarray(downbeats) - 1e-3)
    counts = [int(n) for n in np.diff(idx) if 2 <= n <= 12]
    if not counts:
        return None
    return Counter(counts).most_common(1)[0][0]


def bpm_from_beats(beats: List[float]) -> float:
    if len(beats) < 2:
        return 120.0
    median_interval = float(np.median(np.diff(beats)))
    return 60.0 / median_interval if median_interval > 0 else 120.0


class BeatThisDetectorService:
    """Service wrapper for Beat This! with the normalized detector interface."""

    def __init__(self):
        self._available: Optional[bool] = None
        self._tracker = None
        self._device: Optional[str] = None
        self._load_lock = threading.Lock()
        self._infer_lock = threading.Lock()

    @property
    def checkpoint(self) -> str:
        return os.environ.get("BEAT_THIS_CHECKPOINT", "").strip() or "final0"

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            import beat_this.inference  # noqa: F401
            self._available = True
        except Exception as e:  # ImportError, or a broken torch/torchaudio install
            log_error(f"Beat This! import failed: {e}")
            self._available = False
        return self._available

    def _get_tracker(self):
        if self._tracker is not None:
            return self._tracker
        with self._load_lock:
            if self._tracker is None:
                import torch
                from beat_this.inference import File2Beats
                from models.beat_transformer import gpu_enabled

                device = "cuda" if gpu_enabled() and torch.cuda.is_available() else "cpu"
                fp16 = _env_flag("BEAT_THIS_FP16") and device == "cuda"
                started = time.time()
                self._tracker = File2Beats(
                    checkpoint_path=self.checkpoint,
                    device=device,
                    float16=fp16,
                    dbn=_env_flag("BEAT_THIS_DBN"),
                )
                self._device = device
                log_info(f"Beat This! '{self.checkpoint}' loaded on {device} (fp16={fp16}) "
                         f"in {time.time() - started:.1f}s")
        return self._tracker

    def get_device_info(self) -> Dict[str, Any]:
        return {"device": self._device or "not loaded", "checkpoint": self.checkpoint,
                "dbn": _env_flag("BEAT_THIS_DBN"), "fp16": _env_flag("BEAT_THIS_FP16")}

    def detect_beats(self, file_path: str, **kwargs) -> Dict[str, Any]:
        model_name = f"Beat This! ({self.checkpoint})"
        if not self.is_available():
            return {"success": False, "error": "Beat This! is not available",
                    "model_used": MODEL_ID, "model_name": model_name}

        start_time = time.time()
        try:
            log_info(f"Running Beat This! on: {file_path}")
            tracker = self._get_tracker()
            with self._infer_lock:
                beats, downbeats = tracker(file_path)
            beats = [float(b) for b in np.asarray(beats).ravel()]
            downbeats = [float(d) for d in np.asarray(downbeats).ravel()]

            bpb = beats_per_bar(beats, downbeats)
            time_signature = f"{bpb}/4" if bpb else "4/4"

            from services.audio.audio_utils import get_audio_duration
            try:
                duration = float(get_audio_duration(file_path))
            except Exception:
                duration = float(beats[-1]) if beats else 0.0

            processing_time = time.time() - start_time
            log_debug(f"Beat This!: {len(beats)} beats, {len(downbeats)} downbeats, "
                      f"meter {time_signature}, {processing_time:.2f}s")
            return {
                "success": True,
                "beats": beats,
                "downbeats": downbeats,
                "total_beats": len(beats),
                "total_downbeats": len(downbeats),
                "beats_per_bar": bpb,
                "bpm": float(bpm_from_beats(beats)),
                "time_signature": time_signature,
                "duration": duration,
                "model_used": MODEL_ID,
                "model_name": model_name,
                "processing_time": processing_time,
            }
        except Exception as e:
            error_msg = f"Beat This! detection error: {e}"
            log_error(error_msg)
            return {"success": False, "error": error_msg, "model_used": MODEL_ID,
                    "model_name": model_name, "processing_time": time.time() - start_time}
