import {
  buildBeatLines,
  computePianoRange,
  computeWhiteKeyWidth,
  countWhiteKeys,
  getNoteDrawRank,
} from '@/components/piano-visualizer/piano-visualizer-tab/pianoRollLayout';

const FULL_RANGE = { startMidi: 21, endMidi: 108 };

describe('computePianoRange', () => {
  it('widens the notes to whole octaves from C to B', () => {
    expect(computePianoRange([{ midi: 50 }, { midi: 74 }], 'fit')).toEqual({ startMidi: 48, endMidi: 83 });
  });

  it('keeps at least two octaves for a narrow melody', () => {
    expect(computePianoRange([{ midi: 60 }, { midi: 62 }], 'fit')).toEqual({ startMidi: 60, endMidi: 83 });
  });

  it('uses the full keyboard when there are no notes or full mode is selected', () => {
    expect(computePianoRange([], 'fit')).toEqual(FULL_RANGE);
    expect(computePianoRange([{ midi: 60 }], 'full')).toEqual(FULL_RANGE);
  });

  it('clamps to the piano at both edges and ignores notes off the keyboard', () => {
    expect(computePianoRange([{ midi: 22 }, { midi: 108 }], 'fit')).toEqual(FULL_RANGE);
    expect(computePianoRange([{ midi: 5 }, { midi: 60 }, { midi: 120 }], 'fit')).toEqual({ startMidi: 60, endMidi: 83 });
  });

  it('follows transposed notes', () => {
    const original = computePianoRange([{ midi: 59 }], 'fit');
    const shiftedUp = computePianoRange([{ midi: 60 }], 'fit');
    expect(original.startMidi).toBe(48);
    expect(shiftedUp.startMidi).toBe(60);
  });
});

describe('white key layout', () => {
  it('counts white keys', () => {
    expect(countWhiteKeys(FULL_RANGE)).toBe(52);
    expect(countWhiteKeys({ startMidi: 60, endMidi: 83 })).toBe(14);
  });

  it('gives fitted ranges wider keys, within the limits', () => {
    expect(computeWhiteKeyWidth(1100, 52)).toBe(21);
    expect(computeWhiteKeyWidth(1100, 21)).toBe(40);
    expect(computeWhiteKeyWidth(300, 52)).toBe(10);
    expect(computeWhiteKeyWidth(0, 52)).toBe(14);
  });
});

describe('buildBeatLines', () => {
  it('numbers downbeats by grid index and skips untimed slots', () => {
    expect(buildBeatLines([null, null, 1, 2, 3, 4, 5], 4)).toEqual([
      { startTime: 1, endTime: 1 },
      { startTime: 2, endTime: 2 },
      { startTime: 3, endTime: 3, measureNumber: 2 },
      { startTime: 4, endTime: 4 },
      { startTime: 5, endTime: 5 },
    ]);
  });

  it('returns nothing without beats', () => {
    expect(buildBeatLines(undefined, 4)).toEqual([]);
  });
});

describe('getNoteDrawRank', () => {
  it('paints the vocal line above accompaniment by default', () => {
    expect(getNoteDrawRank('vocal', null)).toBeGreaterThan(getNoteDrawRank('harmony', null));
    expect(getNoteDrawRank('harmony', null)).toBeGreaterThan(getNoteDrawRank('guitar', null));
  });

  it('paints the focused layer above everything, including the vocal line', () => {
    expect(getNoteDrawRank('bass', 'bass')).toBeGreaterThan(getNoteDrawRank('vocal', 'bass'));
    expect(getNoteDrawRank('vocal', 'bass')).toBe(getNoteDrawRank('guitar', 'bass'));
  });
});
