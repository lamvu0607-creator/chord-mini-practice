"""Tests for POST /api/analyze (beats, then chords decoded on those beats, one upload)."""
import io
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

flask = pytest.importorskip('flask')
routes = pytest.importorskip('blueprints.analysis.routes')


def test_beat_grid_passes_tracked_downbeats():
    beats, downbeats = routes.chord_beat_grid({'beats': [1.0, 0.5, 1.5], 'downbeats': [0.5]})
    assert beats == [0.5, 1.0, 1.5]
    assert downbeats == [0.5]


def test_beat_grid_drops_madmom_downbeat_guesses():
    beats, downbeats = routes.chord_beat_grid({
        'beats': [0.5, 1.0, 1.5], 'downbeats': [0.5], 'downbeat_candidates': {'3': [0.5], '4': [0.5]}})
    assert beats == [0.5, 1.0, 1.5]
    assert downbeats is None


def test_beat_grid_needs_two_beats():
    assert routes.chord_beat_grid({'beats': [0.5]}) == (None, None)


class FakeBeats:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def detect_beats(self, file_path, detector, force):
        self.calls.append((detector, os.path.exists(file_path)))
        return self.result


class FakeChords:
    def __init__(self):
        self.calls = []

    def recognize_chords(self, file_path, detector, chord_dict, force, beats, downbeats):
        self.calls.append(dict(detector=detector, beats=beats, downbeats=downbeats))
        return {'success': True, 'chords': [{'start': 0.5, 'end': 1.5, 'chord': 'C'}],
                'total_chords': 1, 'model_used': detector, 'key': 'C:major', 'decoding': 'beat-sync'}


def make_client(beat_result):
    app = flask.Flask(__name__)
    from extensions import limiter
    limiter.init_app(app)
    app.config['RATELIMIT_ENABLED'] = False
    beats, chords = FakeBeats(beat_result), FakeChords()
    app.extensions['services'] = {'beat_detection': beats, 'chord_recognition': chords}
    app.register_blueprint(routes.analysis_bp)
    return app.test_client(), beats, chords


def post(client, **form):
    data = {'file': (io.BytesIO(b'RIFF0000WAVE'), 'song.wav')}
    data.update(form)
    return client.post('/api/analyze', data=data, content_type='multipart/form-data')


def test_runs_beats_then_chords_on_the_beat_grid():
    client, beats, chords = make_client({
        'success': True, 'beats': [0.5, 1.0, 1.5], 'downbeats': [0.5], 'model_used': 'beat-this'})
    response = post(client, beat_detector='beat-this', chord_detector='btc-cl')
    body = response.get_json()
    assert response.status_code == 200 and body['success']
    assert beats.calls == [('beat-this', True)]
    assert chords.calls == [dict(detector='btc-cl', beats=[0.5, 1.0, 1.5], downbeats=[0.5])]
    assert body['beats']['model_used'] == 'beat-this'
    assert body['chords']['key'] == 'C:major'


def test_beat_failure_stops_before_chords():
    client, _, chords = make_client({'success': False, 'error': 'boom'})
    response = post(client)
    assert response.status_code == 500
    assert response.get_json()['stage'] == 'beats'
    assert chords.calls == []


def test_rejects_unknown_detector():
    client, beats, _ = make_client({'success': True, 'beats': []})
    assert post(client, chord_detector='nope').status_code == 400
    assert beats.calls == []


def test_requires_file():
    client, _, _ = make_client({'success': True, 'beats': []})
    assert client.post('/api/analyze', data={}).status_code == 400
