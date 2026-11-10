"""
Request validation utilities for beat detection endpoints.

This module provides validation functions for beat detection requests
including file validation, parameter validation, and error handling.
"""

from typing import Tuple, Optional, Dict, Any
from flask import request
from werkzeug.datastructures import FileStorage


def validate_beat_detection_request() -> Tuple[bool, Optional[str], Optional[FileStorage], Dict[str, Any]]:
    """
    Validate a beat detection request.

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - Optional[FileStorage]: Uploaded file if present
        - Dict[str, Any]: Validated parameters
    """
    # Check if we have either a file upload, audio_path, or audio_url
    file = request.files.get('file')
    audio_path = request.form.get('audio_path')
    audio_url = request.form.get('audio_url') or request.form.get('audioUrl')

    json_data = None
    if request.is_json:
        json_data = request.get_json(silent=True) or {}
        if not audio_url:
            audio_url = json_data.get('audioUrl') or json_data.get('audio_url')
        if not audio_path:
            audio_path = json_data.get('audio_path') or json_data.get('audioPath')

    if not file and not audio_path and not audio_url:
        return False, "No audio file provided. Please upload a file, provide audio_path, or provide audio_url.", None, {}

    # Validate detector parameter
    if json_data:
        detector = json_data.get('detector', 'auto').lower()
        force = json_data.get('force', False)
    else:
        detector = request.form.get('detector', 'auto').lower()
        force_param = request.args.get('force', request.form.get('force', '')).lower()
        force = force_param == 'true'

    valid_detectors = ['beat-this', 'beat-transformer', 'madmom', 'librosa', 'auto']
    if detector not in valid_detectors:
        return False, f"Invalid detector '{detector}'. Must be one of: {', '.join(valid_detectors)}", file, {}

    # Validate file if provided
    if file and file.filename == '':
        return False, "No file selected", None, {}

    params = {
        'detector': detector,
        'force': force,
        'audio_path': audio_path,
        'audio_url': audio_url,
        'json_data': json_data
    }

    return True, None, file, params


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
        'beat-this': 100,        # 100MB for Beat This!
        'beat-transformer': 50,  # 50MB for uploads
        'madmom': 100,          # 100MB for madmom
        'librosa': 200          # 200MB for librosa
    }

    # Check size limits unless force is enabled
    if not force:
        if detector == 'beat-this' and file_size_mb > size_limits['beat-this']:
            return False, f"File too large ({file_size_mb:.1f}MB > {size_limits['beat-this']}MB). Use detector='madmom' or 'librosa', or add 'force=true'."
        elif detector == 'beat-transformer' and file_size_mb > size_limits['beat-transformer']:
            return False, f"File too large ({file_size_mb:.1f}MB > {size_limits['beat-transformer']}MB). Use detector='madmom' or 'librosa', or add 'force=true'."
        elif detector == 'madmom' and file_size_mb > size_limits['madmom']:
            return False, f"File too large ({file_size_mb:.1f}MB > {size_limits['madmom']}MB). Use detector='librosa' or add 'force=true'."
        elif detector == 'librosa' and file_size_mb > size_limits['librosa']:
            return False, f"File too large ({file_size_mb:.1f}MB > {size_limits['librosa']}MB)."
        elif detector == 'auto' and file_size_mb > 50:
            # For auto, suggest alternatives for large files
            return False, f"File too large ({file_size_mb:.1f}MB > 50MB). Specify detector='madmom' or 'librosa' for larger files, or add 'force=true'."

    return True, None
