"""Tuning compensation for BTC's CQT (BTC_TUNING)."""
import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'models', 'ChordMini'))
sys.path.insert(0, os.path.join(HERE, '..'))

btc = pytest.importorskip('btc_chord_recognition')
sf = pytest.importorskip('soundfile')

SR = 22050


def triad(cents, seconds=6.0):
    """C major triad with harmonics, detuned by ``cents`` from A440."""
    t = np.arange(int(SR * seconds)) / SR
    y = np.zeros_like(t)
    for midi in (48, 52, 55, 60, 64, 67):
        f0 = 440.0 * 2 ** ((midi - 69 + cents / 100.0) / 12)
        for h in range(1, 5):
            y += np.sin(2 * np.pi * f0 * h * t) / h
    return (0.1 * y / np.max(np.abs(y))).astype(np.float32)


@pytest.mark.parametrize('cents', [0, 30, -40])
def test_estimate_tuning(cents):
    assert btc.estimate_tuning_semitones(triad(cents), SR) * 100 == pytest.approx(cents, abs=6)


def test_short_audio_keeps_a440():
    assert btc.estimate_tuning_semitones(np.zeros(SR // 2, dtype=np.float32), SR) == 0.0


def test_mode_from_env(monkeypatch):
    monkeypatch.delenv('BTC_TUNING', raising=False)
    assert btc.tuning_mode() == 'auto'
    monkeypatch.setenv('BTC_TUNING', 'off')
    assert btc.tuning_mode() == 'off'


class Config:
    feature = {'n_fft': 512, 'hop_length': 2048, 'n_bins': 144, 'bins_per_octave': 24}
    mp3 = {'song_hz': SR, 'inst_len': 10.0}


def peak_offset(feature):
    """Energy in semitone bins (even) minus quarter-tone bins (odd)."""
    energy = np.exp(feature).mean(axis=1)
    return energy[0::2].sum() - energy[1::2].sum()


def test_cqt_bins_follow_detuned_notes(tmp_path, monkeypatch):
    path = tmp_path / 'sharp.wav'
    sf.write(str(path), triad(45), SR)  # nearly a quarter tone sharp: notes sit between bins

    monkeypatch.setenv('BTC_TUNING', 'off')
    off, *_ = btc._process_audio_with_librosa_cqt(str(path), Config)
    info = {}
    monkeypatch.setenv('BTC_TUNING', 'auto')
    auto, *_ = btc._process_audio_with_librosa_cqt(str(path), Config, info=info)

    assert info['tuning_cents'] == pytest.approx(45, abs=6)
    assert peak_offset(auto) > 0 > peak_offset(off)
