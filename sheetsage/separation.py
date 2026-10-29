"""
Source Separation Module for SheetSage / ChordMini
Extracts clean vocal and accompaniment stems using Spleeter.
"""

import logging
import os
import sys
import types
from pathlib import Path
from typing import Dict, Optional

# Stub fluidsynth on Windows if not present
if "fluidsynth" not in sys.modules:
    sys.modules["fluidsynth"] = types.ModuleType("fluidsynth")

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = REPO_ROOT / "pretrained_models"
os.environ["MODEL_PATH"] = os.getenv("MODEL_PATH", str(DEFAULT_MODEL_PATH))

STEMS_DIR = REPO_ROOT / "storage" / "audio" / "stems"

_separator_instance = None


def get_spleeter_separator():
    """Lazy loader for Spleeter 2stems separator to minimize startup memory."""
    global _separator_instance
    if _separator_instance is None:
        from spleeter.separator import Separator
        logger.info("Initializing Spleeter 2stems separator (Model path: %s)...", os.environ["MODEL_PATH"])
        _separator_instance = Separator("spleeter:2stems", multiprocess=False)
    return _separator_instance


def separate_vocal_stems(
    audio_path: str,
    video_id: Optional[str] = None,
    force_recompute: bool = False,
) -> Dict[str, str]:
    """
    Separates an audio file into vocal and accompaniment stems.
    Results are cached in storage/audio/stems/[identifier]/.

    Returns:
        Dict with keys "vocalsPath" and "accompanimentPath".
    """
    audio_file = Path(audio_path).resolve()
    if not audio_file.is_file():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    identifier = video_id if video_id else audio_file.stem
    target_dir = STEMS_DIR / identifier
    vocals_file = target_dir / "vocals.wav"
    acc_file = target_dir / "accompaniment.wav"

    if (
        not force_recompute
        and vocals_file.is_file()
        and acc_file.is_file()
        and vocals_file.stat().st_size > 1000
        and acc_file.stat().st_size > 1000
    ):
        logger.info("Using cached vocal stems from %s", target_dir)
        return {
            "vocalsPath": str(vocals_file),
            "accompanimentPath": str(acc_file),
            "cached": True,
        }

    target_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Separating audio stems for %s into %s...", audio_file.name, target_dir)

    separator = get_spleeter_separator()
    separator.separate_to_file(
        str(audio_file),
        str(target_dir.parent),
        filename_format=f"{identifier}/{{instrument}}.{{codec}}",
    )

    if not vocals_file.is_file() or not acc_file.is_file():
        raise RuntimeError(f"Spleeter separation completed but stems missing in {target_dir}")

    logger.info("Successfully separated stems: vocals (%d bytes), accompaniment (%d bytes)",
                vocals_file.stat().st_size, acc_file.stat().st_size)

    return {
        "vocalsPath": str(vocals_file),
        "accompanimentPath": str(acc_file),
        "cached": False,
    }
