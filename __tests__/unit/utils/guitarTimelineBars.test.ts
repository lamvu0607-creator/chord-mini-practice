import { buildTimelineBars } from '@/utils/guitarTimelineBars';
import { normalizeChordName } from '@/components/piano-visualizer/ScrollingChordStrip';

const times = (n: number) => Array.from({ length: n }, (_, i) => i * 0.5);

describe('buildTimelineBars', () => {
  it('labels changes and marks a held chord at the next bar start', () => {
    const chords = ['Am', 'Am', 'F', 'F', 'F', 'F', 'C', 'G'];
    const { beats, bars } = buildTimelineBars(chords, times(8), 4);

    expect(bars).toEqual([
      { barIndex: 0, firstBeatIndex: 0, beatCount: 4 },
      { barIndex: 1, firstBeatIndex: 4, beatCount: 4 },
    ]);
    expect(beats.filter((b) => b.isChange).map((b) => b.beatIndex)).toEqual([0, 2, 6, 7]);
    expect(beats.filter((b) => b.isCarriedBarStart).map((b) => b.beatIndex)).toEqual([4]);
  });

  it('treats no-chord beats as empty and labels the chord again after them', () => {
    const chords = ['N.C.', 'N', 'E', 'E', '', 'E', 'E', 'E'];
    const { beats } = buildTimelineBars(chords, times(8), 4);

    expect(beats.map((b) => b.chord)).toEqual(['', '', 'E', 'E', '', 'E', 'E', 'E']);
    expect(beats.filter((b) => b.isChange).map((b) => b.beatIndex)).toEqual([2, 5]);
    expect(beats[4].isCarriedBarStart).toBe(false);
  });

  it('compares enharmonic spellings as equal when a normalizer is given', () => {
    const chords = ['C#m', 'C#m', 'Dbm', 'Dbm'];
    const { beats } = buildTimelineBars(chords, times(4), 2, (c) => normalizeChordName(c, 'flat'));

    expect(beats.filter((b) => b.isChange).map((b) => b.beatIndex)).toEqual([0]);
    expect(beats[2].isCarriedBarStart).toBe(true);
  });

  it('starts bars every three beats in 3/4 and keeps a short last bar', () => {
    const { beats, bars } = buildTimelineBars(['G', 'G', 'G', 'D', 'D'], times(5), 3);

    expect(bars.map((b) => [b.firstBeatIndex, b.beatCount])).toEqual([[0, 3], [3, 2]]);
    expect(beats.map((b) => b.beatInBar)).toEqual([0, 1, 2, 0, 1]);
  });

  it('drops invalid times', () => {
    const { beats } = buildTimelineBars(['A', 'A'], [null, -1], 4);
    expect(beats.map((b) => b.time)).toEqual([null, null]);
  });
});
