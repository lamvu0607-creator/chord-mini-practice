"""Clean Basic Pitch notes transcribed from an SCNet vocals stem into a single vocal line.

Ported from eval_sandbox/fuse.py + common.skyline, keeping the thresholds that were evaluated there
(eval_sandbox/REPORT.md §4.7–4.8): skyline (one note at a time), MIDI range E2..C6, and drop notes
whose stem energy is more than 30 dB below the stem's 95th-percentile frame level (bleed from guitar
solos / backing vocals).
"""

from typing import Any, Dict, List

import numpy as np
import soundfile as sf

SKYLINE_ONSET_TOL = 0.04
VOCAL_RANGE = (40, 84)
VOCAL_GATE_DB = 30.0
FRAME_S = 0.02


def skyline(notes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group notes whose onsets are within SKYLINE_ONSET_TOL of the group's first onset, keep the
    highest one, and cut each kept note at the next kept onset."""
    ordered = sorted(notes, key=lambda note: (note["onset"], note["pitch"]))
    top: List[Dict[str, Any]] = []
    group_start = None
    for note in ordered:
        if group_start is None or note["onset"] - group_start > SKYLINE_ONSET_TOL:
            group_start = note["onset"]
            top.append(dict(note))
        elif note["pitch"] > top[-1]["pitch"]:
            top[-1] = dict(note)
    for current, following in zip(top, top[1:]):
        current["offset"] = min(current["offset"], following["onset"])
    return [note for note in top if note["offset"] - note["onset"] >= 0.01]


def frame_db(audio_path: str) -> np.ndarray:
    audio, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
    mono = audio.mean(1)
    hop = max(1, int(sample_rate * FRAME_S))
    starts = np.arange(0, len(mono), hop)
    rms = np.sqrt(np.add.reduceat(mono ** 2, starts) / hop + 1e-12)
    return 20 * np.log10(rms)


def gate_by_energy(notes: List[Dict[str, Any]], db: np.ndarray) -> List[Dict[str, Any]]:
    if len(db) == 0:
        return notes
    threshold = float(np.percentile(db, 95)) - VOCAL_GATE_DB
    kept = []
    for note in notes:
        start = int(note["onset"] / FRAME_S)
        end = max(start + 1, int(note["offset"] / FRAME_S))
        if start < len(db) and float(db[start:end].mean()) >= threshold:
            kept.append(note)
    return kept


def clean_vocal_notes(notes: List[Dict[str, Any]], stem_path: str) -> List[Dict[str, Any]]:
    line = [note for note in skyline(notes) if VOCAL_RANGE[0] <= note["pitch"] <= VOCAL_RANGE[1]]
    return gate_by_energy(line, frame_db(stem_path))
