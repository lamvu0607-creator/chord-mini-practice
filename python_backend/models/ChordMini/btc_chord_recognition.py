#!/usr/bin/env python3
"""
BTC Chord Recognition Module
Combined functionality from test.py and test_btc.py for API usage
"""

import os
import sys
import threading
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

# --------------------------------------------------------------------------
# Checkpoints and model loading
# --------------------------------------------------------------------------

# 'cl' is the BTC student from "Enhancing Automatic Chord Recognition via
# Pseudo-Labeling and Knowledge Distillation" (arXiv 2602.19778): pseudo-label
# pretraining followed by continual learning on ground truth. The file shipped
# as checkpoints/btc/btc_combined_best.pth is byte-identical to that paper's
# released "BTC CL (full)" checkpoint (ptnghia-j/ChordMini, checkpoints/
# btc_model_best.pth), so 'pl' is kept only as an alias of 'cl' for old cache
# entries. 'sl' is the original BTC (Park et al., ISMIR 2019), the paper's teacher.
CHECKPOINTS = {
    'sl': ('SL', 'btc_model_large_voca.pt'),
    'cl': ('btc', 'btc_combined_best.pth'),
    'pl': ('btc', 'btc_combined_best.pth'),
}

_MODEL_CACHE = {}
_MODEL_LOCK = threading.Lock()
_INFER_LOCK = threading.Lock()


def checkpoint_path(model_variant):
    if model_variant not in CHECKPOINTS:
        raise ValueError(f"Unknown BTC variant: {model_variant}")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'checkpoints', *CHECKPOINTS[model_variant])


def _select_device():
    # CPU by default; CUDA only when explicitly enabled (ENABLE_GPU=true)
    use_cuda = (os.environ.get('ENABLE_GPU', '').strip().lower() in ('1', 'true', 'yes', 'on')
                and torch.cuda.is_available())
    return torch.device("cuda" if use_cuda else "cpu")


def _load_btc(model_variant):
    """(model, feature_mean, feature_std, config, device), cached per variant and device."""
    device = _select_device()
    key = (CHECKPOINTS[model_variant], str(device)) if model_variant in CHECKPOINTS else None
    if key is None:
        raise ValueError(f"Unknown BTC variant: {model_variant}")
    with _MODEL_LOCK:
        if key in _MODEL_CACHE:
            return _MODEL_CACHE[key]

        config = HParams.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config', 'btc_config.yaml'))
        feature_size = config.model.get('feature_size', 144)
        path = checkpoint_path(model_variant)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Model checkpoint not found: {path}")

        model = BTC_model(config=config.model).to(device)
        # The bundled checkpoints are trusted local files; the SL one stores numpy
        # scalars, which weights_only=True refuses.
        checkpoint = torch.load(path, map_location=device, weights_only=False)

        if 'model_state_dict' in checkpoint:
            # CL format: {'model_state_dict', 'normalization': {'mean', 'std'}, ...}
            state_dict = checkpoint['model_state_dict']
            if any(k.startswith('module.') for k in state_dict):
                state_dict = {k.replace('module.', ''): v for k, v in state_dict.items()}
            model.load_state_dict(state_dict)
            stats = checkpoint.get('normalization') if isinstance(checkpoint.get('normalization'), dict) else checkpoint
            if 'mean' in stats and 'std' in stats:
                mean_val = stats['mean'].item() if hasattr(stats['mean'], 'item') else stats['mean']
                std_val = stats['std'].item() if hasattr(stats['std'], 'item') else stats['std']
            else:
                logger.warning("Checkpoint has no normalization stats; features will not be normalised")
                mean_val, std_val = 0.0, 1.0
        elif 'model' in checkpoint:
            # Original BTC format: {'model': {...}, 'mean': float, 'std': float}
            model.load_state_dict(checkpoint['model'])
            mean_val, std_val = checkpoint.get('mean', 0.0), checkpoint.get('std', 1.0)
        else:
            model.load_state_dict(checkpoint)
            mean_val, std_val = 0.0, 1.0

        model.eval()
        logger.info(f"Loaded BTC '{model_variant}' on {device}: normalization mean={float(mean_val):.4f} std={float(std_val):.4f}")
        entry = (model, np.full(feature_size, mean_val), np.full(feature_size, std_val), config, device)
        _MODEL_CACHE[key] = entry
        return entry


def btc_frame_probabilities(audio_file, model_variant='cl'):
    """Run BTC on a file. Returns {probs [frames, 170], frame_times [frames], duration, labels}."""
    model, mean, std, config, device = _load_btc(model_variant)
    feature, feature_per_second, duration, frame_times = extract_features_with_times(audio_file, config)
    if feature is None or feature.shape[1] == 0:
        raise RuntimeError("Feature extraction produced no frames")
    feature = (feature.T - mean) / (std + 1e-8)  # [frames, features]
    overlap = os.environ.get('BTC_OVERLAP', 'true').strip().lower() not in ('0', 'false', 'no', 'off')
    with _INFER_LOCK, torch.no_grad():
        probs = _predict_frame_probabilities(model, feature, config.model.get('seq_len', 108), device, overlap=overlap)
    num_frames = probs.shape[0]
    frame_times = np.asarray(frame_times, dtype=float)[:num_frames]
    if len(frame_times) < num_frames:  # defensive: fall back to constant hop
        frame_times = np.arange(num_frames) * feature_per_second
    return {
        'probs': probs,
        'frame_times': frame_times,
        'hop': float(feature_per_second),
        'duration': float(duration),
        'labels': idx2voca_chord(),
    }


# --------------------------------------------------------------------------
# Key estimation and key prior
# --------------------------------------------------------------------------

KEY_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
# Krumhansl-Kessler key profiles.
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
# Scale tones used by the chord prior; minor includes the harmonic-minor leading tone.
_MAJOR_SCALE = (0, 2, 4, 5, 7, 9, 11)
_MINOR_SCALE = (0, 2, 3, 5, 7, 8, 10, 11)


def chord_pitch_classes(labels):
    """[n_classes, 12] 0/1 matrix of the absolute pitch classes in each chord label
    (rows for 'N' / 'X' are zero), plus a [n_classes] array of root pitch classes (-1 for none)."""
    import mir_eval
    n = len(labels)
    pcs = np.zeros((n, 12))
    roots = np.full(n, -1, dtype=int)
    for idx in range(n):
        label = labels[idx]
        if label in ('N', 'X', 'N/C'):
            continue
        root, bitmap, _ = mir_eval.chord.encode(label)
        if root < 0:
            continue
        pcs[idx] = np.roll(bitmap, root)
        roots[idx] = root
    return pcs, roots


def estimate_key(probs, pcs, roots):
    """Global key from chord posteriors: average pitch-class profile (root counted
    1.5x) correlated with the 24 Krumhansl-Kessler profiles.
    Returns (tonic_pc, mode, label like 'A:minor', confidence = r_best - r_second)."""
    weights = pcs.copy()
    has_root = roots >= 0
    weights[np.where(has_root)[0], roots[has_root]] += 0.5
    chroma = (probs @ weights).mean(axis=0)
    if not np.any(chroma > 0):
        return None
    scores = []
    for mode, profile in (('major', _MAJOR_PROFILE), ('minor', _MINOR_PROFILE)):
        for tonic in range(12):
            scores.append((float(np.corrcoef(chroma, np.roll(profile, tonic))[0, 1]), tonic, mode))
    scores.sort(reverse=True)
    best, second = scores[0], scores[1]
    return {
        'tonic': best[1],
        'mode': best[2],
        'label': f"{KEY_ROOTS[best[1]]}:{best[2]}",
        'confidence': round(best[0] - second[0], 4),
    }


def key_chord_prior(pcs, key, weight):
    """Log-score bonus ``weight`` for chords whose notes all lie in the key's scale."""
    bonus = np.zeros(pcs.shape[0])
    if not key or weight <= 0:
        return bonus
    scale = np.zeros(12)
    scale[[(key['tonic'] + s) % 12 for s in (_MAJOR_SCALE if key['mode'] == 'major' else _MINOR_SCALE)]] = 1
    has_notes = pcs.sum(axis=1) > 0
    diatonic = has_notes & np.all((pcs == 0) | (scale[None, :] == 1), axis=1)
    bonus[diatonic] = weight
    return bonus


# --------------------------------------------------------------------------
# Decoding
# --------------------------------------------------------------------------

def decode_frames(probs, frame_times, duration, switch_penalty=8.0, min_chord_duration=0.3):
    """Frame-level path (no beat information): Viterbi with a constant switch
    penalty, then merge segments shorter than ``min_chord_duration``.
    Returns [[start, end, class_idx], ...]."""
    path = _viterbi_smooth(probs, switch_penalty)
    segments = _labels_to_segments(path, frame_times, duration)
    segments = [s for s in segments if s[1] > s[0]]
    return _merge_short_segments(segments, min_chord_duration)


def _beat_boundaries(beats, duration):
    inner = sorted(float(b) for b in beats if 0.0 < float(b) < duration)
    bounds = [0.0]
    for b in inner:
        if b - bounds[-1] > 1e-3:
            bounds.append(b)
    if duration - bounds[-1] > 1e-3:
        bounds.append(float(duration))
    return np.asarray(bounds)


def beat_sync_decode(probs, frame_times, hop, duration, beats, downbeats=None,
                     penalty_beat=2.5, penalty_downbeat=1.0, prior=None, downbeat_tolerance=0.07):
    """Chord path with one label per beat.

    The audio is cut at the beat times (plus 0 and the end). Each span scores a
    chord by the mean log-probability of the frames whose centre falls inside it
    (the nearest frame for spans shorter than a frame) plus the optional key
    ``prior``. A Viterbi pass then chooses one chord per span, where changing
    chord on a downbeat costs ``penalty_downbeat`` and on any other beat
    ``penalty_beat``. Chord boundaries therefore always sit on beats.
    Returns [[start, end, class_idx], ...] with equal neighbours merged.
    """
    bounds = _beat_boundaries(beats, duration)
    num_spans = len(bounds) - 1
    if num_spans <= 0 or probs.shape[0] == 0:
        return []
    log_probs = np.log(probs + 1e-9)
    centres = np.asarray(frame_times) + hop / 2.0
    span_idx = np.searchsorted(bounds, centres, side='right') - 1
    num_classes = probs.shape[1]
    scores = np.zeros((num_spans, num_classes))
    for s in range(num_spans):
        mask = span_idx == s
        if np.any(mask):
            scores[s] = log_probs[mask].mean(axis=0)
        else:
            mid = (bounds[s] + bounds[s + 1]) / 2.0
            scores[s] = log_probs[int(np.argmin(np.abs(centres - mid)))]
    if prior is not None:
        scores = scores + prior[None, :]

    downbeats = np.asarray(sorted(downbeats or []), dtype=float)
    penalties = np.full(num_spans, penalty_beat)
    if len(downbeats):
        for s in range(1, num_spans):
            j = np.searchsorted(downbeats, bounds[s])
            near = [abs(downbeats[k] - bounds[s]) for k in (j - 1, j) if 0 <= k < len(downbeats)]
            if near and min(near) <= downbeat_tolerance:
                penalties[s] = penalty_downbeat

    classes = np.arange(num_classes)
    score = scores[0].copy()
    backptr = np.zeros((num_spans, num_classes), dtype=np.int32)
    for s in range(1, num_spans):
        best = int(score.argmax())
        switch_score = score[best] - penalties[s]
        stay = score >= switch_score
        backptr[s] = np.where(stay, classes, best)
        score = np.where(stay, score, switch_score) + scores[s]
    path = np.empty(num_spans, dtype=np.int32)
    path[-1] = int(score.argmax())
    for s in range(num_spans - 1, 0, -1):
        path[s - 1] = backptr[s, path[s]]

    segments = []
    for s in range(num_spans):
        if segments and segments[-1][2] == int(path[s]):
            segments[-1][1] = float(bounds[s + 1])
        else:
            segments.append([float(bounds[s]), float(bounds[s + 1]), int(path[s])])
    return segments


def decoding_settings():
    """Decoder knobs from the environment (0 disables a step)."""
    return {
        'switch_penalty': _env_float('BTC_SWITCH_PENALTY', 8.0),
        'min_chord_duration': _env_float('BTC_MIN_CHORD_DURATION', 0.3),
        'penalty_beat': _env_float('BTC_SWITCH_PENALTY_BEAT', 2.5),
        'penalty_downbeat': _env_float('BTC_SWITCH_PENALTY_DOWNBEAT', 1.0),
        'key_prior': _env_float('BTC_KEY_PRIOR', 0.3),
    }


def decode_chords(frames, beats=None, downbeats=None, settings=None):
    """Decode BTC frame probabilities into chords and a key.

    With ``beats`` the beat-synchronous decoder is used (chord changes only on
    beats, cheaper on downbeats, key prior applied); without, the frame decoder.
    Returns {'segments': [[start, end, label]], 'key', 'key_confidence', 'decoding'}.
    """
    cfg = dict(decoding_settings(), **(settings or {}))
    probs, labels = frames['probs'], frames['labels']
    pcs, roots = chord_pitch_classes(labels)
    key = estimate_key(probs, pcs, roots)

    if beats is not None and len(beats) >= 2:
        prior = key_chord_prior(pcs, key, cfg['key_prior'])
        segments = beat_sync_decode(probs, frames['frame_times'], frames['hop'], frames['duration'],
                                    beats, downbeats, cfg['penalty_beat'], cfg['penalty_downbeat'], prior)
        decoding = 'beat-sync'
    else:
        segments = decode_frames(probs, frames['frame_times'], frames['duration'],
                                 cfg['switch_penalty'], cfg['min_chord_duration'])
        decoding = 'frame'

    return {
        'segments': [[s, e, 'N/C' if labels[i] == 'N' else labels[i]] for s, e, i in segments],
        'key': key['label'] if key else None,
        'key_confidence': key['confidence'] if key else None,
        'decoding': decoding,
    }


def btc_chord_recognition(audio_file, output_file, model_variant='cl', beats=None, downbeats=None):
    """
    Main BTC chord recognition function for API usage.

    Args:
        audio_file (str): Path to input audio file
        output_file (str): Path to output .lab file
        model_variant (str): 'cl' (default), 'sl' (original BTC) or 'pl' (alias of 'cl')
        beats, downbeats (list[float] | None): beat times in seconds; when given,
            chords are decoded per beat (see ``beat_sync_decode``)

    Returns:
        dict | bool: {'key', 'key_confidence', 'decoding', 'chord_count'} on
        success (truthy), False on failure.
    """
    try:
        logger.logging_verbosity(1)
        warnings.filterwarnings('ignore')
        if hasattr(torch, 'backends') and hasattr(torch.backends, 'mps'):
            torch.backends.mps.enabled = False

        frames = btc_frame_probabilities(audio_file, model_variant)
        result = decode_chords(frames, beats, downbeats)
        raw_changes = int(np.count_nonzero(np.diff(frames['probs'].argmax(axis=1))))
        logger.info(
            f"BTC '{model_variant}': decoding={result['decoding']} key={result['key']} "
            f"(conf {result['key_confidence']}); frame-argmax changes {raw_changes} -> {len(result['segments'])} segments"
        )

        os.makedirs(os.path.dirname(output_file) or '.', exist_ok=True)
        with open(output_file, 'w') as f:
            for start_time, end_time, chord_name in result['segments']:
                f.write(f"{start_time:.6f}\t{end_time:.6f}\t{chord_name}\n")

        logger.info(f"BTC chord recognition complete. Saved to {output_file}")
        return {
            'key': result['key'],
            'key_confidence': result['key_confidence'],
            'decoding': result['decoding'],
            'chord_count': len(result['segments']),
        }

    except Exception as e:
        logger.error(f"BTC chord recognition failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False
