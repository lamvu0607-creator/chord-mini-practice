"""Unit tests for BTC decoding helpers (no model weights needed).

Run from python_backend/:  python -m pytest tests -q
"""
import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'models', 'ChordMini'))
sys.path.insert(0, os.path.join(HERE, '..'))

btc = pytest.importorskip('btc_chord_recognition')

LABELS = btc.idx2voca_chord()
INDEX = {label: idx for idx, label in LABELS.items()}
HOP = 0.1


def frames_for(spans, n_classes=170, peak=0.9):
    """Frame posteriors where each (start, end, label) span puts `peak` on that label."""
    duration = spans[-1][1]
    times = np.arange(0, duration, HOP)
    probs = np.full((len(times), n_classes), (1 - peak) / (n_classes - 1))
    for start, end, label in spans:
        mask = (times + HOP / 2 >= start) & (times + HOP / 2 < end)
        probs[mask] = (1 - peak) / (n_classes - 1)
        probs[mask, INDEX[label]] = peak
    return {'probs': probs, 'frame_times': times, 'hop': HOP, 'duration': float(duration), 'labels': LABELS}


def labels_of(result):
    return [seg[2] for seg in result['segments']]


def test_beat_sync_moves_change_onto_beat():
    # Change from C to G happens 40% of the way between beats at 2.0 and 2.5
    frames = frames_for([(0, 2.2, 'C'), (2.2, 4.0, 'G')])
    beats = [0.5 * i for i in range(8)]
    res = btc.decode_chords(frames, beats, beats[::4], {'key_prior': 0.0})
    assert res['decoding'] == 'beat-sync'
    assert labels_of(res) == ['C', 'G']
    boundary = res['segments'][1][0]
    assert boundary in beats


def test_frame_decoding_without_beats():
    frames = frames_for([(0, 2.2, 'C'), (2.2, 4.0, 'G')])
    res = btc.decode_chords(frames)
    assert res['decoding'] == 'frame'
    assert labels_of(res) == ['C', 'G']
    assert abs(res['segments'][1][0] - 2.2) <= HOP


def test_short_flicker_removed_between_beats():
    # A 0.2 s blip of F inside a C bar should not survive beat-sync decoding
    frames = frames_for([(0, 1.1, 'C'), (1.1, 1.3, 'F'), (1.3, 4.0, 'C')])
    beats = [0.5 * i for i in range(8)]
    res = btc.decode_chords(frames, beats, beats[::4], {'key_prior': 0.0})
    assert labels_of(res) == ['C']


def test_changes_snap_to_downbeats_when_offbeat_changes_are_expensive():
    beats = [0.5 * i for i in range(16)]
    frames = frames_for([(0, 2.0, 'C'), (2.0, 4.0, 'G'), (4.0, 8.0, 'C')], peak=0.9)
    settings = {'penalty_beat': 50.0, 'penalty_downbeat': 1.0, 'key_prior': 0.0}
    on_downbeat = btc.decode_chords(frames, beats, beats[::4], settings)
    assert [(s, c) for s, _, c in on_downbeat['segments']] == [(0.0, 'C'), (2.0, 'G'), (4.0, 'C')]
    # With the bar lines shifted by one beat, the G bar moves onto them
    shifted = btc.decode_chords(frames, beats, [0.5, 2.5, 4.5, 6.5], settings)
    assert [(s, c) for s, _, c in shifted['segments']] == [(0.0, 'C'), (2.5, 'G'), (4.5, 'C')]
    # With equal penalties the change stays where the audio has it
    equal = btc.decode_chords(frames, beats, [0.5, 2.5, 4.5, 6.5], {**settings, 'penalty_downbeat': 50.0})
    assert labels_of(equal) == ['C']


def test_key_prior_breaks_near_ties():
    # Each span is split between a diatonic and a non-diatonic chord; the prior picks diatonic ones
    beats = [0.5 * i for i in range(17)]
    probs_spans = [(0, 2, 'C'), (2, 4, 'F'), (4, 6, 'G'), (6, 8, 'C')]
    frames = frames_for(probs_spans, peak=0.5)
    gb = INDEX['Gb']
    frames['probs'][(frames['frame_times'] >= 4) & (frames['frame_times'] < 6), gb] = 0.49
    no_prior = btc.decode_chords(frames, beats, beats[::4], {'key_prior': 0.0})
    with_prior = btc.decode_chords(frames, beats, beats[::4], {'key_prior': 0.3})
    assert with_prior['key'] == 'C:major'
    assert 'Gb' not in labels_of(with_prior)
    assert labels_of(with_prior) == ['C', 'F', 'G', 'C']
    # Zero prior leaves the decision to the posteriors alone
    assert labels_of(no_prior)[2] in ('G', 'Gb')


@pytest.mark.parametrize('progression,expected', [
    (['C', 'F', 'G', 'A:min', 'F', 'G', 'C'], 'C:major'),
    (['A:min', 'D:min', 'E', 'A:min', 'F', 'E', 'A:min'], 'A:minor'),
])
def test_estimate_key(progression, expected):
    spans = [(i * 2.0, (i + 1) * 2.0, chord) for i, chord in enumerate(progression)]
    frames = frames_for(spans)
    res = btc.decode_chords(frames)
    assert res['key'] == expected
    assert res['key_confidence'] > 0


def test_no_chord_label_is_reported_as_nc():
    frames = frames_for([(0, 1.0, 'N'), (1.0, 4.0, 'C')])
    res = btc.decode_chords(frames, [0.5 * i for i in range(8)], None, {'key_prior': 0.0})
    assert labels_of(res)[0] == 'N/C'


def test_beat_boundaries_ignore_out_of_range_and_duplicates():
    bounds = btc._beat_boundaries([-1.0, 0.0, 0.5, 0.5, 1.0, 9.0], 2.0)
    assert list(bounds) == [0.0, 0.5, 1.0, 2.0]
