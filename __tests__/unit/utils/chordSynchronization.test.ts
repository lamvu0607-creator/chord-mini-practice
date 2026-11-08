/**
 * Unit Tests: chordSynchronization
 *
 * Verifies pure chord-to-beat alignment behavior for the current
 * 50%-late / 50%-early midpoint rule, forward fill semantics,
 * and special chord normalization.
 */

import { synchronizeChords } from '@/utils/chordSynchronization';

describe('chordSynchronization', () => {
  it('returns an empty array when chords or beats are missing', () => {
    expect(synchronizeChords([], [{ time: 0 }] as any)).toEqual([]);
    expect(synchronizeChords([{ start: 0, end: 1, chord: 'C' }] as any, [])).toEqual([]);
  });

  it('keeps an onset on beat 1 when it is before the next-beat 50% midpoint threshold', () => {
    const result = synchronizeChords(
      [
        { start: 0.2, end: 0.9, chord: 'C' },
        { start: 1.49, end: 2.1, chord: 'G' },
      ] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }] as any
    );

    expect(result).toEqual([
      { chord: 'C', beatIndex: 0 },
      { chord: 'G', beatIndex: 1 },
      { chord: 'G', beatIndex: 2 },
    ]);
  });

  it('advances an onset to the next beat once it reaches the 50% midpoint threshold', () => {
    const result = synchronizeChords(
      [{ start: 1.5, end: 2.1, chord: 'Am' }] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }] as any
    );

    expect(result).toEqual([
      { chord: 'N/C', beatIndex: 0 },
      { chord: 'N/C', beatIndex: 1 },
      { chord: 'Am', beatIndex: 2 },
    ]);
  });

  it('keeps chords before the first beat on beat 0', () => {
    const result = synchronizeChords(
      [{ start: -0.1, end: 0.4, chord: 'F' }] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }] as any
    );

    expect(result).toEqual([
      { chord: 'F', beatIndex: 0 },
      { chord: 'F', beatIndex: 1 },
      { chord: 'F', beatIndex: 2 },
    ]);
  });

  it('treats exact beat starts as belonging to that beat', () => {
    const result = synchronizeChords(
      [{ start: 1, end: 1.8, chord: 'Dm' }] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }] as any
    );

    expect(result).toEqual([
      { chord: 'N/C', beatIndex: 0 },
      { chord: 'Dm', beatIndex: 1 },
      { chord: 'Dm', beatIndex: 2 },
    ]);
  });

  it('keeps a late onset on the same beat until the next beat threshold is reached', () => {
    const result = synchronizeChords(
      [{ start: 1.34, end: 1.8, chord: 'G' }] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }, { time: 3 }] as any
    );

    expect(result).toEqual([
      { chord: 'N/C', beatIndex: 0 },
      { chord: 'G', beatIndex: 1 },
      { chord: 'G', beatIndex: 2 },
      { chord: 'G', beatIndex: 3 },
    ]);
  });

  it('normalizes N chords to N/C and uses later matches for the same beat', () => {
    const result = synchronizeChords(
      [
        { start: 0.1, end: 0.4, chord: 'C' },
        { start: 0.2, end: 0.5, chord: 'N' },
      ] as any,
      [{ time: 0 }, { time: 1 }] as any
    );

    expect(result).toEqual([
      { chord: 'N/C', beatIndex: 0 },
      { chord: 'N/C', beatIndex: 1 },
    ]);
  });

  describe('downbeat snap for short beats', () => {
    // 6/8-style eighth-note beats, 1/3 s apart; downbeats every 6 beats.
    const beats = Array.from({ length: 12 }, (_, i) => ({ time: i / 3 })) as any;
    const downbeats = [0, 2];

    it('moves an onset that is up to 0.25 s late back onto the downbeat', () => {
      const chords = [
        { start: 0, end: 2.2, chord: 'C' },
        { start: 2.2, end: 4, chord: 'G' }, // 0.2 s after the downbeat at 2.0
      ] as any;
      expect(synchronizeChords(chords, beats)[6].chord).toBe('C');
      const snapped = synchronizeChords(chords, beats, downbeats);
      expect(snapped[6].chord).toBe('G');
      expect(snapped[5].chord).toBe('C');
    });

    it('leaves onsets alone when they are later than 0.25 s or not right after a downbeat', () => {
      const late = [
        { start: 0, end: 2.3, chord: 'C' },
        { start: 2.3, end: 4, chord: 'G' }, // 0.3 s late
      ] as any;
      expect(synchronizeChords(late, beats, downbeats)[6].chord).toBe('C');
      const midBar = [
        { start: 0, end: 1.2, chord: 'C' },
        { start: 1.2, end: 4, chord: 'G' }, // 0.2 s after beat 3, not a downbeat
      ] as any;
      expect(synchronizeChords(midBar, beats, downbeats)[3].chord).toBe('C');
    });

    it('does not overwrite a chord already on the downbeat', () => {
      const chords = [
        { start: 0, end: 2.0, chord: 'C' },
        { start: 2.0, end: 2.2, chord: 'F' },
        { start: 2.2, end: 4, chord: 'G' },
      ] as any;
      const result = synchronizeChords(chords, beats, downbeats);
      expect(result[6].chord).toBe('F');
      expect(result[7].chord).toBe('G');
    });

    it('does not snap when beats are 0.4 s or longer', () => {
      const slowBeats = Array.from({ length: 10 }, (_, i) => ({ time: i * 0.45 })) as any;
      const chords = [
        { start: 0, end: 2.04, chord: 'C' },
        { start: 2.04, end: 4, chord: 'G' }, // 0.24 s after downbeat 1.8, past the half-beat point
      ] as any;
      const withSnap = synchronizeChords(chords, slowBeats, [0, 1.8]);
      expect(withSnap).toEqual(synchronizeChords(chords, slowBeats));
    });
  });
});
