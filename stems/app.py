import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict

from flask import Flask, jsonify, request

from service import StemRuntime

STORAGE_AUDIO_DIR = Path(os.getenv("STORAGE_AUDIO_DIR", "/app/storage/audio")).resolve()
STEMS_SUBDIR = "stems"

logging.basicConfig(level=os.getenv("STEMS_LOG_LEVEL", "INFO").upper())
logger = logging.getLogger(__name__)

runtime = StemRuntime()

# jobId -> {"progress": float, "updatedAt": float}; only the active/recent jobs are kept.
_progress: Dict[str, Dict[str, float]] = {}
_progress_lock = threading.Lock()


def _set_progress(job_id: str, value: float) -> None:
    with _progress_lock:
        _progress[job_id] = {"progress": round(value, 4), "updatedAt": time.time()}
        stale = [key for key, entry in _progress.items() if time.time() - entry["updatedAt"] > 3600]
        for key in stale:
            _progress.pop(key, None)


def _resolve_inside_storage(relative_path: str) -> Path:
    """Resolve a client-supplied relative path and refuse anything outside the shared audio dir."""
    if not isinstance(relative_path, str) or not relative_path.strip():
        raise ValueError("path is required")
    candidate = (STORAGE_AUDIO_DIR / relative_path.strip()).resolve()
    if candidate != STORAGE_AUDIO_DIR and STORAGE_AUDIO_DIR not in candidate.parents:
        raise ValueError("path escapes the audio storage directory")
    return candidate


def create_app() -> Flask:
    flask_app = Flask(__name__)

    @flask_app.get("/")
    def root() -> Any:
        return jsonify({"name": "ChordMini stems", "status": "ok",
                        "endpoints": ["GET /health", "GET /info", "POST /separate", "GET /progress/<jobId>"]})

    @flask_app.get("/health")
    def health() -> Any:
        warmup = (request.args.get("warmup") or "").strip().lower() in {"1", "true", "yes", "on"}
        if warmup:
            try:
                runtime.ensure_loaded()
            except Exception as exc:  # surface missing weights instead of failing the container
                return jsonify({"status": "unavailable", "error": str(exc), **runtime.info()}), 503
        return jsonify({"status": "healthy", "service": "stems", **runtime.info()})

    @flask_app.get("/info")
    def info() -> Any:
        return jsonify(runtime.info())

    @flask_app.get("/progress/<job_id>")
    def progress(job_id: str) -> Any:
        with _progress_lock:
            entry = _progress.get(job_id)
        if entry is None:
            return jsonify({"jobId": job_id, "known": False}), 404
        return jsonify({"jobId": job_id, "known": True, **entry})

    @flask_app.post("/separate")
    def separate() -> Any:
        payload = request.get_json(silent=True) or {}
        job_id = str(payload.get("jobId") or "").strip() or "anonymous"
        try:
            input_path = _resolve_inside_storage(payload.get("inputPath", ""))
            output_dir = _resolve_inside_storage(payload.get("outputDir", ""))
            if (STORAGE_AUDIO_DIR / STEMS_SUBDIR).resolve() not in output_dir.parents:
                raise ValueError(f"outputDir must be inside {STEMS_SUBDIR}/")
            if not input_path.is_file():
                raise ValueError("inputPath does not exist")
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

        _set_progress(job_id, 0.0)
        try:
            result = runtime.separate(input_path, output_dir, progress=lambda value: _set_progress(job_id, value))
        except FileNotFoundError as exc:
            logger.error("Stem separation unavailable: %s", exc)
            return jsonify({"success": False, "error": str(exc)}), 503
        except Exception as exc:
            logger.exception("Stem separation failed for %s", input_path.name)
            return jsonify({"success": False, "error": str(exc)}), 500
        _set_progress(job_id, 1.0)
        return jsonify({"success": True, "data": result})

    return flask_app


app = create_app()

if __name__ == "__main__":
    if os.getenv("STEMS_PRELOAD", "false").strip().lower() in {"1", "true", "yes", "on"}:
        runtime.ensure_loaded()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8083")))
