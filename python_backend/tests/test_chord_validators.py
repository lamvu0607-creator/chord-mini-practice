"""Tests for the optional beats/downbeats parameters of /api/recognize-chords."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

validators = pytest.importorskip('blueprints.chords.validators')
parse = validators.parse_time_list


def test_missing_values_are_none():
    assert parse(None, 'beats') == (None, None)
    assert parse('', 'beats') == (None, None)
    assert parse('[]', 'beats') == (None, None)


def test_json_string_and_list_are_sorted():
    assert parse('[1.5, 0.5, 1]', 'beats') == ([0.5, 1.0, 1.5], None)
    assert parse([2, 1], 'beats') == ([1.0, 2.0], None)


@pytest.mark.parametrize('raw', ['not json', '{"a": 1}', '[1, "x"]', '[true]', '[-1]', '[NaN]', [1e9]])
def test_invalid_values_are_rejected(raw):
    values, error = parse(raw, 'beats')
    assert values is None and error


def test_too_many_values_rejected():
    values, error = parse(list(range(validators.MAX_BEAT_TIMES + 1)), 'beats')
    assert values is None and 'too many' in error
