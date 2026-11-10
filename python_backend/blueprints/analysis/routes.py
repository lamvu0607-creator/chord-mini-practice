"""
POST /api/analyze: beat tracking, then chord recognition decoded on that beat grid,
from a single upload.

Before this endpoint the browser uploaded the same audio twice (detect-beats, then
recognize-chords with the beats it had just received). The response nests the two
existing payloads unchanged, so clients reuse their parsing:

    {"success": true, "beats": {...detect-beats payload...},
     "chords": {...recognize-chords payload...}, "processing_time": s}
"""

import os
import time
import traceback
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, current_app, request

from config import get_config
from extensions import limiter
from services.audio.tempfiles import temporary_file
from utils.logging import log_info, log_error
from ..beats.validators import validate_file_size as validate_beat_file_size
from ..chords.validators import validate_file_size as validate_chord_file_size

analysis_bp = Blueprint('analysis', __name__)
config = get_config()

VALID_BEAT_DETECTORS = ('beat-this', 'beat-transformer', 'madmom', 'librosa', 'auto')
VALID_CHORD_DETECTORS = ('btc-cl', 'btc-sl', 'btc-pl', 'chord-cnn-lstm', 'auto')
AUDIO_EXTENSIONS = ('.mp3', '.wav', '.ogg', '.flac', '.m4a', '.webm')


def chord_beat_grid(beat_result: Dict[str, Any]) -> Tuple[Optional[List[float]], Optional[List[float]]]:
    """Beats and downbeats to decode chords on.

    Downbeats are passed only when the beat model tracked them. madmom's downbeats are
    fixed slices of the beat list (it returns ``downbeat_candidates`` for 3 and 4),
    so with madmom every beat is treated alike.
    """
    beats = sorted(float(t) for t in (beat_result.get('beats') or [])
                   if isinstance(t, (int, float)) and not isinstance(t, bool) and t >= 0)
    if len(beats) < 2:
        return None, None
    if beat_result.get('downbeat_candidates'):
        return beats, None
    downbeats = sorted(float(t) for t in (beat_result.get('downbeats') or [])
                       if isinstance(t, (int, float)) and not isinstance(t, bool) and t >= 0)
    return beats, (downbeats or None)


def _form_choice(name: str, valid: Tuple[str, ...], default: str) -> Tuple[Optional[str], Optional[str]]:
    value = (request.form.get(name) or default).strip().lower()
    if value not in valid:
        return None, f"Invalid {name} '{value}'. Must be one of: {', '.join(valid)}"
    return value, None


@analysis_bp.route('/api/analyze', methods=['POST'])
@limiter.limit(config.get_rate_limit('heavy_processing'))
def analyze():
    """
    Parameters (multipart/form-data):
    - file: audio file
    - beat_detector: beat-this (default) | madmom | beat-transformer | librosa | auto
    - chord_detector: btc-cl (default) | btc-sl | btc-pl | chord-cnn-lstm | auto
    - chord_dict: optional chord dictionary
    - force: 'true' to skip per-model size limits
    """
    start = time.time()
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({"success": False, "error": "No audio file provided"}), 400

    beat_detector, error = _form_choice(
        'beat_detector', VALID_BEAT_DETECTORS, os.environ.get('DEFAULT_BEAT_MODEL', 'beat-this'))
    if error:
        return jsonify({"success": False, "error": error}), 400
    chord_detector, error = _form_choice(
        'chord_detector', VALID_CHORD_DETECTORS, os.environ.get('DEFAULT_CHORD_MODEL', 'btc-cl'))
    if error:
        return jsonify({"success": False, "error": error}), 400
    chord_dict = request.form.get('chord_dict') or None
    force = (request.args.get('force') or request.form.get('force') or '').lower() == 'true'

    ok, error = validate_beat_file_size(file, beat_detector, force)
    if not ok:
        return jsonify({"success": False, "error": error}), 413
    ok, error = validate_chord_file_size(file, chord_detector, force)
    if not ok:
        return jsonify({"success": False, "error": error}), 413

    services = current_app.extensions['services']
    beat_service = services['beat_detection']
    chord_service = services['chord_recognition']

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in AUDIO_EXTENSIONS:
        ext = '.mp3'

    try:
        with temporary_file(suffix=ext) as path:
            file.save(path)

            beat_result = beat_service.detect_beats(file_path=path, detector=beat_detector, force=force)
            if not beat_result.get('success'):
                return jsonify({
                    "success": False,
                    "stage": "beats",
                    "error": beat_result.get('error', 'Beat detection failed'),
                }), 500

            beats, downbeats = chord_beat_grid(beat_result)
            chord_result = chord_service.recognize_chords(
                file_path=path,
                detector=chord_detector,
                chord_dict=chord_dict,
                force=force,
                beats=beats,
                downbeats=downbeats,
            )
            if not chord_result.get('success'):
                return jsonify({
                    "success": False,
                    "stage": "chords",
                    "beats": beat_result,
                    "error": chord_result.get('error', 'Chord recognition failed'),
                }), 500

        elapsed = time.time() - start
        log_info(f"Analyze: {beat_result.get('model_used')} {beat_result.get('total_beats')} beats, "
                 f"{chord_result.get('model_used')} {chord_result.get('total_chords')} chords "
                 f"({chord_result.get('decoding')}), key={chord_result.get('key')}, {elapsed:.1f}s")
        return jsonify({
            "success": True,
            "beats": beat_result,
            "chords": chord_result,
            "processing_time": elapsed,
        })
    except Exception as e:
        log_error(f"Analyze failed: {e}")
        log_error(traceback.format_exc())
        return jsonify({"success": False, "error": f"Analysis failed: {e}"}), 500
