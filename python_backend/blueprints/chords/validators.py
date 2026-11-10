"""
Request validation utilities for chord recognition endpoints.

This module provides validation functions for chord recognition requests
including file validation, parameter validation, and error handling.
"""

import json
import math
from typing import Tuple, Optional, Dict, Any, List
from flask import request
from werkzeug.datastructures import FileStorage
from utils.chord_mappings import get_supported_chord_dicts, get_default_chord_dict


def validate_chord_recognition_request() -> Tuple[bool, Optional[str], Optional[FileStorage], Dict[str, Any]]:
    """
    Validate a chord recognition request.

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - Optional[FileStorage]: Uploaded file if present
        - Dict[str, Any]: Validated parameters
    """
    # Check if we have either a file upload, audio_path, or JSON data
    file = request.files.get('file')
    audio_path = request.form.get('audio_path')
    json_data = None

    # Check for JSON data (for URL-based requests)
    if request.is_json:
        json_data = request.get_json()
        audio_url = json_data.get('audioUrl') if json_data else None
        if audio_url:
            # Convert relative URL to file path logic will be handled in the route
            pass

    if not file and not audio_path and not json_data:
        return False, "No audio file provided. Please upload a file, provide audio_path, or send JSON with audioUrl.", None, {}

    # Validate detector parameter
    if json_data:
        detector = json_data.get('detector', 'auto').lower()
        chord_dict = json_data.get('chordDict', None)
    else:
        detector = request.form.get('detector', 'auto').lower()
        chord_dict = request.form.get('chord_dict', None)

    valid_detectors = ['btc-cl', 'btc-sl', 'btc-pl', 'chord-cnn-lstm', 'auto']
    if detector not in valid_detectors:
        return False, f"Invalid detector '{detector}'. Must be one of: {', '.join(valid_detectors)}", file, {}

    # Validate force parameter
    if json_data:
        force = json_data.get('force', False)
    else:
        force_param = request.args.get('force', request.form.get('force', '')).lower()
        force = force_param == 'true'

    # Validate use_spleeter parameter
    if json_data:
        use_spleeter = json_data.get('useSpleeter', False)
    else:
        spleeter_param = request.form.get('use_spleeter', 'false').lower()
        use_spleeter = spleeter_param == 'true'

    # Optional beat grid for beat-synchronous chord decoding
    beats_raw = json_data.get('beats') if json_data else request.form.get('beats')
    downbeats_raw = json_data.get('downbeats') if json_data else request.form.get('downbeats')
    beats, error = parse_time_list(beats_raw, 'beats')
    if error:
        return False, error, file, {}
    downbeats, error = parse_time_list(downbeats_raw, 'downbeats')
    if error:
        return False, error, file, {}
    if downbeats and not beats:
        downbeats = None

    # Validate file if provided
    if file and file.filename == '':
        return False, "No file selected", None, {}

    params = {
        'detector': detector,
        'chord_dict': chord_dict,
        'force': force,
        'use_spleeter': use_spleeter,
        'audio_path': audio_path,
        'json_data': json_data,
        'beats': beats,
        'downbeats': downbeats,
    }

    return True, None, file, params


MAX_BEAT_TIMES = 20000          # ~3 h at 120 BPM
MAX_BEAT_TIME_SECONDS = 4 * 3600


def parse_time_list(raw: Any, name: str) -> Tuple[Optional[List[float]], Optional[str]]:
    """Parse an optional list of times in seconds (JSON array, or a JSON string of one).

    Returns (sorted list or None, error message or None).
    """
    if raw is None or raw == '':
        return None, None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return None, f"'{name}' must be a JSON array of numbers (seconds)"
    if not isinstance(raw, list):
        return None, f"'{name}' must be an array of numbers (seconds)"
    if len(raw) > MAX_BEAT_TIMES:
        return None, f"'{name}' has too many entries (max {MAX_BEAT_TIMES})"
    values = []
    for item in raw:
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            return None, f"'{name}' must contain only numbers"
        value = float(item)
        if not math.isfinite(value) or value < 0 or value > MAX_BEAT_TIME_SECONDS:
            return None, f"'{name}' contains an out-of-range time: {item}"
        values.append(value)
    return (sorted(values) if values else None), None


def validate_chord_dict_for_detector(chord_dict: str, detector: str) -> Tuple[bool, Optional[str]]:
    """
    Validate that a chord dictionary is supported by a detector.

    Args:
        chord_dict: Chord dictionary name
        detector: Detector name

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
    """
    if not chord_dict:
        return True, None  # Will use default

    supported_dicts = get_supported_chord_dicts(detector)
    if chord_dict not in supported_dicts:
        return False, f"Chord dictionary '{chord_dict}' not supported by {detector}. Supported: {', '.join(supported_dicts)}"

    return True, None


def get_file_size_mb(file: FileStorage) -> float:
    """
    Get file size in megabytes.

    Args:
        file: Uploaded file

    Returns:
        float: File size in MB
    """
    # Save current position
    current_pos = file.tell()

    # Seek to end to get size
    file.seek(0, 2)  # Seek to end
    size_bytes = file.tell()

    # Restore original position
    file.seek(current_pos)

    return size_bytes / (1024 * 1024)


def validate_file_size(file: FileStorage, detector: str, force: bool) -> Tuple[bool, Optional[str]]:
    """
    Validate file size based on detector and force parameter.

    Args:
        file: Uploaded file
        detector: Selected detector
        force: Whether force parameter is enabled

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
    """
    file_size_mb = get_file_size_mb(file)

    # Size limits based on detector
    size_limits = {
        'chord-cnn-lstm': 100,  # 100MB for Chord-CNN-LSTM
        'btc-cl': 50,          # 50MB for BTC models
        'btc-sl': 50,
        'btc-pl': 50,
        'auto': 50             # Conservative limit for auto selection
    }

    # Check size limits unless force is enabled
    if not force:
        limit = size_limits.get(detector, 50)
        if file_size_mb > limit:
            if detector == 'auto':
                return False, f"File too large ({file_size_mb:.1f}MB > {limit}MB). Specify detector='chord-cnn-lstm' for larger files, or add 'force=true'."
            else:
                return False, f"File too large ({file_size_mb:.1f}MB > {limit}MB). Add 'force=true' to override size limits."

    return True, None


def normalize_audio_url_to_path(audio_url: str, audio_dir: str) -> str:
    """
    Convert a relative audio URL or local endpoint to an absolute file path.
    Supports:
      - /audio/<filename>
      - /api/serve-local-audio?filename=<filename>
      - /api/audio/<videoId>
      - Relative or absolute filesystem paths

    Args:
        audio_url: Audio URL or path
        audio_dir: Audio directory path

    Returns:
        str: Absolute file path or original URL if remote
    """
    import os
    from urllib.parse import urlparse, parse_qs, unquote

    if not audio_url or not isinstance(audio_url, str):
        return audio_url

    clean_url = audio_url.strip()

    # Direct filesystem path check
    if os.path.isabs(clean_url) and os.path.exists(clean_url):
        return clean_url

    # Check for /audio/ prefix
    if clean_url.startswith('/audio/'):
        relative_path = clean_url[7:]
        return os.path.join(audio_dir, unquote(relative_path))

    # Parse path and query
    parsed = urlparse(clean_url)
    if parsed.path == '/api/serve-local-audio':
        qs = parse_qs(parsed.query)
        filename = qs.get('filename', [''])[0]
        if filename:
            return os.path.join(audio_dir, unquote(filename))

    if parsed.path.startswith('/api/audio/'):
        video_id = unquote(parsed.path.replace('/api/audio/', ''))
        if video_id:
            # Check for direct <videoId>.mp3
            exact = os.path.join(audio_dir, f"{video_id}.mp3")
            if os.path.exists(exact):
                return exact
            # Check files in audio_dir matching videoId prefix
            if os.path.isdir(audio_dir):
                for f in os.listdir(audio_dir):
                    if f.startswith(f"audio_[{video_id}]_") or f.startswith(f"{video_id}_") or f.startswith(f"{video_id}."):
                        return os.path.join(audio_dir, f)
            return exact

    return clean_url


def validate_model_name(model_name: str) -> bool:
    """
    Validate a model name.

    Args:
        model_name: Model name to validate

    Returns:
        bool: True if the model name is valid
    """
    valid_models = ['btc-cl', 'btc-sl', 'btc-pl', 'chord-cnn-lstm']
    return model_name in valid_models


def get_detector_display_name(detector: str) -> str:
    """
    Get a human-readable display name for a detector.

    Args:
        detector: Detector name

    Returns:
        str: Display name
    """
    display_names = {
        'chord-cnn-lstm': 'Chord-CNN-LSTM',
        'btc-cl': 'BTC CL (Continual Learning)',
        'btc-sl': 'BTC (original)',
        'btc-pl': 'BTC CL (legacy id btc-pl)',
        'auto': 'Auto Selection'
    }
    return display_names.get(detector, detector)
