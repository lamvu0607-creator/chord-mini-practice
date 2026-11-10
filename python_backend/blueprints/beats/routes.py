"""
Beat detection routes for ChordMini Flask application.

This module provides all beat detection related endpoints including
main detection, testing, and model information.
"""

import os
import tempfile
import traceback
import requests
from flask import Blueprint, jsonify, current_app
from extensions import limiter
from config import get_config
from .validators import (
    validate_beat_detection_request,
    validate_file_size
)
from services.audio.tempfiles import temporary_file
from utils.logging import log_error, log_debug
from utils.paths import AUDIO_DIR
from ..chords.validators import normalize_audio_url_to_path

# Create blueprint
beats_bp = Blueprint('beats', __name__)

# Get configuration for rate limits
config = get_config()


def _download_remote_audio_to_temp_path(file_url: str, temp_path: str, timeout_seconds: int = 300) -> None:
    """Stream a remote audio file into a temporary path."""
    with requests.get(file_url, stream=True, timeout=(30, timeout_seconds)) as response:
        response.raise_for_status()
        with open(temp_path, 'wb') as file_handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file_handle.write(chunk)


@beats_bp.route('/api/detect-beats', methods=['POST'])
@limiter.limit(config.get_rate_limit('heavy_processing'))
def detect_beats():
    """
    Detect beats in an audio file

    Parameters:
    - file: The audio file to analyze (multipart/form-data)
    - audio_path: Alternative to file, path to an existing audio file on the server
    - detector: 'beat-transformer', 'madmom', 'librosa', or 'auto' (default)
    - force: Set to 'true' to force using requested detector even for large files

    Returns:
    - JSON with beat and downbeat information
    """
    try:
        # Validate request
        is_valid, error_msg, file, params = validate_beat_detection_request()
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        # Get beat detection service
        beat_service = current_app.extensions['services']['beat_detection']

        file_path = None
        temp_file_path = None

        try:
            if file:
                # Validate file size
                size_valid, size_error = validate_file_size(file, params['detector'], params['force'])
                if not size_valid:
                    return jsonify({"error": size_error}), 413

                # Create temporary file
                ext = os.path.splitext(file.filename or '')[1].lower()
                if ext not in ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.webm']:
                    ext = '.mp3'
                with temporary_file(suffix=ext) as temp_path:
                    file.save(temp_path)
                    file_path = temp_path

                    # Run beat detection
                    result = beat_service.detect_beats(
                        file_path=file_path,
                        detector=params['detector'],
                        force=params['force']
                    )
            elif params.get('audio_url'):
                audio_url = params['audio_url']
                resolved_path = normalize_audio_url_to_path(audio_url, str(AUDIO_DIR))
                if os.path.exists(resolved_path):
                    file_path = resolved_path
                elif audio_url.startswith('http://') or audio_url.startswith('https://'):
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
                    temp_file_path = temp_file.name
                    _download_remote_audio_to_temp_path(audio_url, temp_file_path)
                    file_path = temp_file_path
                else:
                    return jsonify({"error": f"Audio file not found: {audio_url}"}), 404

                result = beat_service.detect_beats(
                    file_path=file_path,
                    detector=params['detector'],
                    force=params['force']
                )
            elif params.get('audio_path'):
                # Use provided audio path
                file_path = params['audio_path']
                if not os.path.exists(file_path):
                    return jsonify({"error": f"Audio file not found: {file_path}"}), 404

                # Run beat detection
                result = beat_service.detect_beats(
                    file_path=file_path,
                    detector=params['detector'],
                    force=params['force']
                )
            else:
                return jsonify({"error": "No valid audio input provided"}), 400

            # Return result
            if result.get('success'):
                return jsonify(result)
            else:
                return jsonify(result), 500

        except Exception as e:
            log_error(f"Error in beat detection: {e}")
            log_error(traceback.format_exc())
            return jsonify({
                "success": False,
                "error": f"Beat detection failed: {str(e)}"
            }), 500
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.unlink(temp_file_path)
                    log_debug(f"Cleaned up temporary file: {temp_file_path}")
                except Exception as cleanup_error:
                    log_error(f"Failed to clean up temporary file {temp_file_path}: {cleanup_error}")

    except Exception as e:
        log_error(f"Unexpected error in detect_beats: {e}")
        log_error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@beats_bp.route('/api/model-info', methods=['GET'])
@limiter.limit(config.get_rate_limit('light_processing'))
def model_info():
    """Return information about the available beat detection models"""
    try:
        # Get beat detection service
        beat_service = current_app.extensions['services']['beat_detection']

        # Get detector information
        detector_info = beat_service.get_detector_info()

        # Format response to match existing API
        available_models = detector_info['available_detectors']

        # Default model: DEFAULT_BEAT_MODEL if available, then Beat This!, madmom,
        # Beat-Transformer, librosa
        preferred = os.environ.get('DEFAULT_BEAT_MODEL', '').strip() or 'beat-this'
        default_model = next(
            (m for m in (preferred, 'beat-this', 'madmom', 'beat-transformer', 'librosa') if m in available_models),
            'none'
        )

        response = {
            "success": True,
            "default_beat_model": default_model,
            "available_beat_models": available_models,
            "beat_this_available": 'beat-this' in available_models,
            "beat_transformer_available": 'beat-transformer' in available_models,
            "madmom_available": 'madmom' in available_models,
            "librosa_available": 'librosa' in available_models,
            "file_size_limits": {
                "upload_limit_mb": 50,
                "local_file_limit_mb": 100,
                "beat_transformer_limit_mb": 100,
                "force_parameter_available": True
            },
            "beat_model_info": {
                "beat-this": {
                    "name": "Beat This!",
                    "description": "Transformer beat and downbeat tracker (ISMIR 2024), no source separation",
                    "performance": "Highest accuracy, fast on GPU",
                    "uses_spleeter": False
                },
                "beat-transformer": {
                    "name": "Beat-Transformer",
                    "description": "DL model with 5-channel audio separation, flexible in time signatures, slow processing speed",
                    "performance": "High accuracy, slower processing",
                    "uses_spleeter": True
                },
                "madmom": {
                    "name": "Madmom",
                    "description": "Neural network with high accuracy and speed, best for common time signatures (3/4, 4/4)",
                    "performance": "Medium accuracy, medium speed",
                    "uses_spleeter": False
                },
                "librosa": {
                    "name": "Librosa",
                    "description": "Classical signal processing approach",
                    "performance": "Fast processing, basic accuracy",
                    "uses_spleeter": False
                }
            },
            "detector_details": detector_info['detectors']
        }

        return jsonify(response)

    except Exception as e:
        log_error(f"Error getting model info: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@beats_bp.route('/api/test-beat-this', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_beat_this():
    """Test Beat This! availability"""
    try:
        detector = current_app.extensions['services']['beat_detection'].detectors['beat-this']
        if detector.is_available():
            return jsonify({
                "success": True,
                "model": "Beat This!",
                "status": "available",
                "device_info": detector.get_device_info(),
                "message": "Beat This! is ready for use"
            })
        return jsonify({
            "success": False,
            "model": "Beat This!",
            "status": "unavailable",
            "error": "Beat This! is not available (beat_this package missing)"
        })
    except Exception as e:
        log_error(f"Error testing Beat This!: {e}")
        return jsonify({"success": False, "model": "Beat This!", "status": "error", "error": str(e)}), 500


@beats_bp.route('/api/test-beat-transformer', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_beat_transformer():
    """Test Beat-Transformer model availability"""
    try:
        # Get beat detection service
        beat_service = current_app.extensions['services']['beat_detection']
        detector = beat_service.detectors['beat-transformer']

        if detector.is_available():
            # Try to get device info
            try:
                device_info = detector.get_device_info()
                return jsonify({
                    "success": True,
                    "model": "Beat-Transformer",
                    "status": "available",
                    "device_info": device_info,
                    "message": "Beat-Transformer model is ready for use"
                })
            except Exception as e:
                return jsonify({
                    "success": True,
                    "model": "Beat-Transformer",
                    "status": "available",
                    "device_error": str(e),
                    "message": "Beat-Transformer model is available but device info failed"
                })
        else:
            return jsonify({
                "success": False,
                "model": "Beat-Transformer",
                "status": "unavailable",
                "error": "Beat-Transformer model not available"
            }), 404

    except Exception as e:
        return jsonify({
            "success": False,
            "model": "Beat-Transformer",
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@beats_bp.route('/api/test-madmom', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_madmom():
    """Test Madmom beat detection model availability"""
    try:
        # Get beat detection service
        beat_service = current_app.extensions['services']['beat_detection']
        detector = beat_service.detectors['madmom']

        if detector.is_available():
            # Try to import madmom to get version
            try:
                import madmom
                version = getattr(madmom, '__version__', 'unknown')
            except ImportError:
                version = 'unknown'

            return jsonify({
                "success": True,
                "model": "Madmom",
                "status": "available",
                "version": version,
                "message": "Madmom beat detection model is ready for use"
            })
        else:
            return jsonify({
                "success": False,
                "model": "Madmom",
                "status": "unavailable",
                "error": "Madmom not installed or not available"
            }), 404

    except Exception as e:
        return jsonify({
            "success": False,
            "model": "Madmom",
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@beats_bp.route('/api/test-librosa', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_librosa():
    """Test Librosa beat detection availability"""
    try:
        # Get beat detection service
        beat_service = current_app.extensions['services']['beat_detection']
        detector = beat_service.detectors['librosa']

        if detector.is_available():
            # Try to import librosa to get version
            try:
                import librosa
                version = getattr(librosa, '__version__', 'unknown')
            except ImportError:
                version = 'unknown'

            return jsonify({
                "success": True,
                "model": "Librosa",
                "status": "available",
                "version": version,
                "message": "Librosa beat detection is ready for use"
            })
        else:
            return jsonify({
                "success": False,
                "model": "Librosa",
                "status": "unavailable",
                "error": "Librosa not installed or not available"
            }), 404

    except Exception as e:
        return jsonify({
            "success": False,
            "model": "Librosa",
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@beats_bp.route('/api/test-all-models', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_all_models():
    """Test all available beat detection models"""
    try:
        # Get beat detection service
        beat_service = current_app.extensions['services']['beat_detection']

        results = {
            "success": True,
            "models_tested": {},
            "available_models": beat_service.get_available_detectors(),
            "summary": {
                "total_models": len(beat_service.detectors),
                "available_count": 0,
                "unavailable_count": 0
            }
        }

        # Test each detector
        for name, detector in beat_service.detectors.items():
            try:
                is_available = detector.is_available()

                model_result = {
                    "available": is_available,
                    "name": name,
                    "status": "available" if is_available else "unavailable"
                }

                if is_available:
                    results["summary"]["available_count"] += 1

                    # Add version info if possible
                    if name in ('beat-this', 'beat-transformer'):
                        try:
                            device_info = detector.get_device_info()
                            model_result["device_info"] = device_info
                        except Exception as e:
                            model_result["device_error"] = str(e)
                    elif name == 'madmom':
                        try:
                            import madmom
                            model_result["version"] = getattr(madmom, '__version__', 'unknown')
                        except ImportError:
                            pass
                    elif name == 'librosa':
                        try:
                            import librosa
                            model_result["version"] = getattr(librosa, '__version__', 'unknown')
                        except ImportError:
                            pass
                else:
                    results["summary"]["unavailable_count"] += 1
                    model_result["error"] = f"{name} not available"

                results["models_tested"][name] = model_result

            except Exception as e:
                results["models_tested"][name] = {
                    "available": False,
                    "status": "error",
                    "error": str(e)
                }
                results["summary"]["unavailable_count"] += 1

        return jsonify(results)

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


# Duplicate test_dbn_isolation function removed


# Duplicate test_all_models function removed


@beats_bp.route('/api/test-dbn-isolation', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_dbn_isolation():
    """Test DBN (Dynamic Bayesian Network) isolation for madmom"""
    try:
        # Get beat detection service
        beat_service = current_app.extensions['services']['beat_detection']
        madmom_detector = beat_service.detectors['madmom']

        if not madmom_detector.is_available():
            return jsonify({
                "success": False,
                "error": "Madmom not available for DBN testing"
            }), 404

        # Test DBN components
        try:
            from madmom.features.beats import DBNBeatTrackingProcessor
            from madmom.features.downbeats import DBNDownBeatTrackingProcessor

            # Test beat DBN
            _beat_dbn = DBNBeatTrackingProcessor(fps=100)

            # Test downbeat DBN
            _downbeat_dbn = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=100)

            return jsonify({
                "success": True,
                "message": "DBN components successfully isolated and tested",
                "components": {
                    "beat_dbn": "available",
                    "downbeat_dbn": "available"
                },
                "dbn_config": {
                    "fps": 100,
                    "beat_tracker": "DBNBeatTrackingProcessor",
                    "downbeat_tracker": "DBNDownBeatTrackingProcessor"
                }
            })

        except ImportError as e:
            return jsonify({
                "success": False,
                "error": f"Failed to import DBN components: {str(e)}"
            }), 500

        except Exception as e:
            return jsonify({
                "success": False,
                "error": f"DBN initialization failed: {str(e)}"
            }), 500

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500
