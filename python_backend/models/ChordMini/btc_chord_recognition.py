#!/usr/bin/env python3
"""
BTC Chord Recognition Module
Combined functionality from test.py and test_btc.py for API usage
"""

import os
import sys
import numpy as np
import torch
import warnings
from pathlib import Path
import librosa
import soundfile as sf
from scipy import interpolate

# Add the ChordMini directory to Python path for module imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# Project imports - use absolute imports from current directory
try:
    from modules.utils import logger
    from modules.utils.mir_eval_modules import idx2voca_chord
    from modules.utils.hparams import HParams
    from modules.models.Transformer.btc_model import BTC_model
except ImportError as e:
    # If modules import fails, try relative imports
    try:
        import importlib.util

        # Import logger
        logger_spec = importlib.util.spec_from_file_location("logger", os.path.join(current_dir, "modules", "utils", "logger.py"))
        logger_module = importlib.util.module_from_spec(logger_spec)
        logger_spec.loader.exec_module(logger_module)
        logger = logger_module

        # Import mir_eval_modules
        mir_spec = importlib.util.spec_from_file_location("mir_eval_modules", os.path.join(current_dir, "modules", "utils", "mir_eval_modules.py"))
        mir_module = importlib.util.module_from_spec(mir_spec)
        mir_spec.loader.exec_module(mir_module)
        idx2voca_chord = mir_module.idx2voca_chord

        # Import hparams
        hparams_spec = importlib.util.spec_from_file_location("hparams", os.path.join(current_dir, "modules", "utils", "hparams.py"))
        hparams_module = importlib.util.module_from_spec(hparams_spec)
        hparams_spec.loader.exec_module(hparams_module)
        HParams = hparams_module.HParams

        # Import BTC model
        btc_spec = importlib.util.spec_from_file_location("btc_model", os.path.join(current_dir, "modules", "models", "Transformer", "btc_model.py"))
        btc_module = importlib.util.module_from_spec(btc_spec)
        btc_spec.loader.exec_module(btc_module)
        BTC_model = btc_module.BTC_model

    except Exception as import_error:
        print(f"Failed to import BTC modules: {import_error}")
        raise ImportError(f"Could not import required BTC modules: {e}") from import_error

# Explicitly disable MPS globally
if hasattr(torch, 'backends') and hasattr(torch.backends, 'mps'):
    torch.backends.mps.enabled = False

def _process_audio_with_librosa_cqt(audio_file, config, return_frame_times=False):
    """Process audio using librosa's CQT implementation.

    The audio is analysed in independent chunks of ``inst_len`` seconds. A
    centred CQT of one chunk yields ``1 + chunk_samples // hop`` frames (108 for
    10 s at 22050 Hz / hop 2048), which is slightly more than ``chunk_seconds /
    (hop / sr)``. Timestamps therefore have to restart at every chunk boundary;
    assuming a constant ``hop / sr`` per frame drifts ~31 ms per chunk (~1 s over
    a 5-minute song). With ``return_frame_times=True`` the exact per-frame start
    times are returned as a fourth value.
    """
    n_fft = config.feature.get('n_fft', 512)
    hop_length = config.feature.get('hop_length', 2048)
    original_wav, sr = librosa.load(audio_file, sr=config.mp3.get('song_hz', 22050), mono=True)

    if len(original_wav) < n_fft:
        original_wav = np.pad(original_wav, (0, n_fft - len(original_wav)), mode="constant", constant_values=0)

    chunk_samples = int(config.mp3.get('song_hz', 22050) * config.mp3.get('inst_len', 10.0))
    current_sec_hz = 0
    chunks = []
    frame_times = []

    def _add_chunk(wav_segment, chunk_start_sample):
        cqt = librosa.cqt(wav_segment, sr=sr, hop_length=hop_length,
                          n_bins=config.feature.get('n_bins', 144),
                          bins_per_octave=config.feature.get('bins_per_octave', 24))
        chunks.append(np.abs(cqt))
        frame_times.append((chunk_start_sample + np.arange(cqt.shape[1]) * hop_length) / sr)

    while len(original_wav) > current_sec_hz + chunk_samples:
        _add_chunk(original_wav[current_sec_hz:current_sec_hz + chunk_samples], current_sec_hz)
        current_sec_hz += chunk_samples

    # Process remaining audio
    if current_sec_hz < len(original_wav):
        remaining_wav = original_wav[current_sec_hz:]
        if len(remaining_wav) >= n_fft:
            _add_chunk(remaining_wav, current_sec_hz)

    feature = np.concatenate(chunks, axis=1) if chunks else None
    # Apply logarithmic scaling (crucial for model compatibility)
    if feature is not None:
        feature = np.log(np.abs(feature) + 1e-6)

    song_length_second = len(original_wav) / sr
    feature_per_second = hop_length / config.mp3.get('song_hz', 22050)

    if return_frame_times:
        times = np.concatenate(frame_times) if frame_times else np.zeros(0)
        return feature, feature_per_second, song_length_second, times
    return feature, feature_per_second, song_length_second

def _process_audio_with_alternative(audio_file, config):
    """Alternative feature extraction using STFT."""
    try:
        audio_data, sr = sf.read(audio_file)
        if audio_data.ndim > 1:
            audio_data = audio_data.mean(axis=1)
        
        if sr != config.mp3.get('song_hz', 22050):
            audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=config.mp3.get('song_hz', 22050))
            sr = config.mp3.get('song_hz', 22050)

        hop_length = config.feature.get('hop_length', 2048)
        n_fft = config.feature.get('n_fft', 2048)
        
        stft = librosa.stft(audio_data, hop_length=hop_length, n_fft=n_fft)
        magnitude = np.abs(stft)

        # Resize to match expected feature dimensions (144 bins)
        target_bins = config.feature.get('n_bins', 144)
        if magnitude.shape[0] != target_bins:
            # Interpolate to target number of bins
            x = np.linspace(0, 1, magnitude.shape[0])
            x_new = np.linspace(0, 1, target_bins)
            magnitude_resized = np.zeros((target_bins, magnitude.shape[1]))

            for i in range(magnitude.shape[1]):
                f_interp = interpolate.interp1d(x, magnitude[:, i], kind='linear')
                magnitude_resized[:, i] = f_interp(x_new)

            magnitude = magnitude_resized

        # Apply logarithmic scaling (crucial for model compatibility)
        magnitude = np.log(np.abs(magnitude) + 1e-6)

        song_length_second = len(audio_data) / sr
        feature_per_second = hop_length / sr

        return magnitude, feature_per_second, song_length_second
        
    except Exception as e:
        logger.error(f"Alternative feature extraction failed: {e}")
        raise

def process_audio_with_padding(audio_file, config):
    """Process audio file with proper handling of short segments."""
    feature, feature_per_second, song_length_second, _ = extract_features_with_times(audio_file, config)
    return feature, feature_per_second, song_length_second


def extract_features_with_times(audio_file, config):
    """Like process_audio_with_padding, plus the start time (s) of every frame."""
    try:
        return _process_audio_with_librosa_cqt(audio_file, config, return_frame_times=True)
    except Exception as e:
        logger.warning(f"CQT extraction failed: {e}. Trying alternative method.")
        try:
            # A single STFT over the whole file has a constant hop, so no drift.
            feature, fps, song_len = _process_audio_with_alternative(audio_file, config)
            return feature, fps, song_len, np.arange(feature.shape[1]) * fps
        except Exception as e2:
            logger.error(f"All feature extraction methods failed: {e2}")
            raise


def _env_float(name, default):
    try:
        value = float(os.environ.get(name, '').strip() or default)
        return value if value >= 0 else default
    except ValueError:
        return default


def _predict_frame_probabilities(model, feature, seq_len, device, overlap=True):
    """Per-frame chord probabilities, shape [frames, classes].

    With ``overlap`` the model runs on windows advanced by half a window and the
    outputs are blended with triangular weights, so every frame is predicted with
    context on both sides instead of sitting at the hard edge of a block.
    """
    num_frames = feature.shape[0]

    def run(window):
        tensor = torch.tensor(window, dtype=torch.float32).unsqueeze(0).to(device)
        return torch.softmax(model(tensor), dim=-1).squeeze(0).cpu().numpy()

    if not overlap:
        pad = (-num_frames) % seq_len
        padded = np.pad(feature, ((0, pad), (0, 0)), mode="constant", constant_values=0)
        probs = [run(padded[s:s + seq_len]) for s in range(0, padded.shape[0], seq_len)]
        return np.concatenate(probs, axis=0)[:num_frames]

    hop = seq_len // 2
    tail = hop + (-(num_frames + 2 * hop)) % hop + seq_len
    padded = np.pad(feature, ((hop, tail), (0, 0)), mode="constant", constant_values=0)
    weights = np.bartlett(seq_len + 2)[1:-1][:, None]
    acc = None
    weight_sum = np.zeros((padded.shape[0], 1))
    for start in range(0, padded.shape[0] - seq_len + 1, hop):
        probs = run(padded[start:start + seq_len])
        if acc is None:
            acc = np.zeros((padded.shape[0], probs.shape[1]))
        acc[start:start + seq_len] += probs * weights
        weight_sum[start:start + seq_len] += weights
    return (acc / np.maximum(weight_sum, 1e-9))[hop:hop + num_frames]


def _viterbi_smooth(probs, switch_penalty):
    """Most likely label path when every chord change costs ``switch_penalty``
    (in log-probability). Stay costs 0, so brief flips between two near-tied
    chords are removed while well-supported changes survive. O(frames x classes).
    """
    if switch_penalty <= 0 or probs.shape[0] == 0:
        return probs.argmax(axis=1)
    log_probs = np.log(probs + 1e-9)
    num_frames, num_classes = log_probs.shape
    classes = np.arange(num_classes)
    score = log_probs[0].copy()
    backptr = np.zeros((num_frames, num_classes), dtype=np.int32)
    for t in range(1, num_frames):
        best = int(score.argmax())
        switch_score = score[best] - switch_penalty
        stay = score >= switch_score
        backptr[t] = np.where(stay, classes, best)
        score = np.where(stay, score, switch_score) + log_probs[t]
    path = np.empty(num_frames, dtype=np.int32)
    path[-1] = int(score.argmax())
    for t in range(num_frames - 1, 0, -1):
        path[t - 1] = backptr[t, path[t]]
    return path


def _labels_to_segments(labels, frame_times, end_time):
    """[(start, end, label)] with boundaries at the exact frame start times."""
    segments = []
    start_idx = 0
    for i in range(1, len(labels) + 1):
        if i == len(labels) or labels[i] != labels[start_idx]:
            seg_end = frame_times[i] if i < len(labels) else end_time
            segments.append([float(frame_times[start_idx]), float(seg_end), int(labels[start_idx])])
            start_idx = i
    return segments


def _merge_short_segments(segments, min_duration):
    """Fold segments shorter than ``min_duration`` into their longer neighbour
    (instead of dropping them, which used to leave gaps), then join equal labels."""
    segs = [list(s) for s in segments]
    if min_duration > 0:
        while len(segs) > 1:
            durations = [s[1] - s[0] for s in segs]
            i = int(np.argmin(durations))
            if durations[i] >= min_duration:
                break
            if i == 0:
                target = 1
            elif i == len(segs) - 1:
                target = i - 1
            else:
                target = i - 1 if durations[i - 1] >= durations[i + 1] else i + 1
            if target < i:
                segs[target][1] = segs[i][1]
            else:
                segs[target][0] = segs[i][0]
            del segs[i]
    merged = []
    for seg in segs:
        if merged and merged[-1][2] == seg[2]:
            merged[-1][1] = seg[1]
        else:
            merged.append(seg)
    return merged

def btc_chord_recognition(audio_file, output_file, model_variant='sl'):
    """
    Main BTC chord recognition function for API usage.
    
    Args:
        audio_file (str): Path to input audio file
        output_file (str): Path to output .lab file
        model_variant (str): 'sl' for supervised learning or 'pl' for pseudo-label
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Set up logging
        logger.logging_verbosity(1)
        warnings.filterwarnings('ignore')
        
        # CPU by default; CUDA only when explicitly enabled (ENABLE_GPU=true)
        use_cuda = (os.environ.get('ENABLE_GPU', '').strip().lower() in ('1', 'true', 'yes', 'on')
                    and torch.cuda.is_available())
        device = torch.device("cuda" if use_cuda else "cpu")
        logger.info(f"BTC chord recognition using device: {device}")
        
        # Explicitly disable MPS
        if hasattr(torch, 'backends') and hasattr(torch.backends, 'mps'):
            torch.backends.mps.enabled = False
        
        # Load configuration
        config_path = os.path.join(os.path.dirname(__file__), 'config', 'btc_config.yaml')
        config = HParams.load(config_path)
        
        # BTC uses large vocabulary
        n_classes = config.model.get('num_chords', 170)
        idx_to_chord = idx2voca_chord()

        # Initialize BTC model
        model = BTC_model(config=config.model).to(device)
        
        # Load model checkpoint based on variant
        if model_variant == 'sl':
            checkpoint_path = os.path.join(os.path.dirname(__file__), 'checkpoints', 'SL', 'btc_model_large_voca.pt')
        else:  # pl
            checkpoint_path = os.path.join(os.path.dirname(__file__), 'checkpoints', 'btc', 'btc_combined_best.pth')
        
        if not os.path.exists(checkpoint_path):
            logger.error(f"Model checkpoint not found: {checkpoint_path}")
            return False
        
        # Load checkpoint with weights_only=False for compatibility
        try:
            checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
        except TypeError:
            # Fallback for older PyTorch versions that don't have weights_only parameter
            checkpoint = torch.load(checkpoint_path, map_location=device)
        # Extract model state dict and normalization stats based on checkpoint format
        if 'model_state_dict' in checkpoint:
            # PL format: {'model_state_dict': {...}, 'mean': tensor, 'std': tensor, ...}
            state_dict = checkpoint['model_state_dict']

            # Remove 'module.' prefix if present (from DataParallel training)
            if any(key.startswith('module.') for key in state_dict.keys()):
                state_dict = {key.replace('module.', ''): value for key, value in state_dict.items()}

            model.load_state_dict(state_dict)

            # Extract normalization stats. The PL checkpoint stores them under
            # 'normalization': {'mean', 'std'}; missing that key meant PL ran on
            # unnormalised features (mean ~-1.8, std ~2 instead of ~0/1).
            stats = checkpoint.get('normalization') if isinstance(checkpoint.get('normalization'), dict) else checkpoint
            if 'mean' in stats and 'std' in stats:
                mean_val = stats['mean'].item() if hasattr(stats['mean'], 'item') else stats['mean']
                std_val = stats['std'].item() if hasattr(stats['std'], 'item') else stats['std']
                ckpt_mean = np.full(config.model.get('feature_size', 144), mean_val)
                ckpt_std = np.full(config.model.get('feature_size', 144), std_val)
                logger.info(f"Using checkpoint normalization: mean={float(np.mean(mean_val)):.4f}, std={float(np.mean(std_val)):.4f}")
            else:
                logger.warning("Checkpoint has no normalization stats; features will not be normalised")
                ckpt_mean = checkpoint.get('feature_mean', np.zeros(config.model.get('feature_size', 144)))
                ckpt_std = checkpoint.get('feature_std', np.ones(config.model.get('feature_size', 144)))
        elif 'model' in checkpoint:
            # SL format: {'model': {...}, 'mean': float, 'std': float}
            model.load_state_dict(checkpoint['model'])
            # Extract normalization stats
            mean_val = checkpoint.get('mean', 0.0)
            std_val = checkpoint.get('std', 1.0)
            ckpt_mean = np.full(config.model.get('feature_size', 144), mean_val)
            ckpt_std = np.full(config.model.get('feature_size', 144), std_val)
        else:
            # Direct state dict format
            model.load_state_dict(checkpoint)
            # Use default normalization if stats not available
            ckpt_mean = np.zeros(config.model.get('feature_size', 144))
            ckpt_std = np.ones(config.model.get('feature_size', 144))
        
        model.eval()
        
        # Process audio
        feature, feature_per_second, song_length_second, frame_times = extract_features_with_times(audio_file, config)

        if feature is None:
            logger.error("Feature extraction failed")
            return False
        
        # Transpose and normalize using checkpoint stats
        feature = feature.T  # Shape: [frames, features]
        logger.info(f"Feature stats BEFORE norm: Min={np.min(feature):.4f}, Max={np.max(feature):.4f}, Mean={np.mean(feature):.4f}, Std={np.std(feature):.4f}")
        epsilon = 1e-8
        feature = (feature - ckpt_mean) / (ckpt_std + epsilon)
        logger.info(f"Feature stats AFTER norm (using checkpoint stats): Min={np.min(feature):.4f}, Max={np.max(feature):.4f}, Mean={np.mean(feature):.4f}, Std={np.std(feature):.4f}")
        
        seq_len = config.model.get('seq_len', 108)
        original_num_frames = feature.shape[0]
        if original_num_frames == 0:
            logger.warning("No predictions generated")
            return False

        # Smoothing knobs (env): 0 disables each step and restores raw argmax output.
        switch_penalty = _env_float('BTC_SWITCH_PENALTY', 8.0)
        min_chord_duration = _env_float('BTC_MIN_CHORD_DURATION', 0.3)
        overlap = os.environ.get('BTC_OVERLAP', 'true').strip().lower() not in ('0', 'false', 'no', 'off')

        with torch.no_grad():
            probs = _predict_frame_probabilities(model, feature, seq_len, device, overlap=overlap)
        all_predictions = _viterbi_smooth(probs, switch_penalty)
        raw_changes = int(np.count_nonzero(np.diff(probs.argmax(axis=1))))
        smoothed_changes = int(np.count_nonzero(np.diff(all_predictions)))
        logger.info(
            f"BTC smoothing: overlap={overlap} switch_penalty={switch_penalty} "
            f"min_chord_duration={min_chord_duration}s; chord changes {raw_changes} -> {smoothed_changes}"
        )

        # Function to standardize chord notation to match Chord-CNN-LSTM format
        def standardize_chord_notation(chord_name):
            # Convert 'N' to 'N/C' to match Chord-CNN-LSTM format
            if chord_name == 'N':
                return 'N/C'

            # Other standardizations can be added here if needed
            return chord_name

        # Generate .lab format. Frame times restart at every CQT chunk, so the
        # timestamps stay locked to the audio for the whole song (no drift).
        frame_times = np.asarray(frame_times, dtype=float)[:original_num_frames]
        if len(frame_times) < original_num_frames:  # defensive: fall back to constant hop
            frame_times = np.arange(original_num_frames) * feature_per_second
        segments = _labels_to_segments(all_predictions, frame_times, song_length_second)
        segments = [s for s in segments if s[1] > s[0]]
        segments = _merge_short_segments(segments, min_chord_duration)
        lines = []
        for start_time, end_time, chord_idx in segments:
            chord_name = standardize_chord_notation(idx_to_chord[chord_idx])
            lines.append(f"{start_time:.6f}\t{end_time:.6f}\t{chord_name}")

        # Save output
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        with open(output_file, 'w') as f:
            for line in lines:
                f.write(line + '\n')
        
        logger.info(f"BTC chord recognition complete. Saved to {output_file}")
        return True
        
    except Exception as e:
        logger.error(f"BTC chord recognition failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False
