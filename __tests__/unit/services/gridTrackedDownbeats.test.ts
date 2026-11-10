import { findTrackedDownbeatIndex, getChordGridData } from '@/services/chord-analysis/gridAssembly';
import { GridAnalysisResult } from '@/services/chord-analysis/gridTypes';

// 16 beats, 0.5 s apart; one chord throughout, so chord changes say nothing about bar lines.
const beatTimes = Array.from({ length: 16 }, (_, i) => i * 0.5);
// Downbeats on beats 1, 5, 9, 13 (a one-beat pickup)
const pickupDownbeats = [0.5, 2.5, 4.5, 6.5];

function analysis(overrides: Partial<GridAnalysisResult> = {}): GridAnalysisResult {
  return {
    beats: beatTimes.map((time) => ({ time })),
    synchronizedChords: beatTimes.map((_, beatIndex) => ({ chord: 'C', beatIndex })),
    downbeats: pickupDownbeats,
    beatModel: 'beat-this',
    chordModel: 'btc-cl',
    beatDetectionResult: { time_signature: 4, bpm: 120 },
    ...overrides,
  } as GridAnalysisResult;
}

function visualIndexOf(grid: ReturnType<typeof getChordGridData>, audioIndex: number): number {
  const item = grid.originalAudioMapping?.find((m) => m.audioIndex === audioIndex);
  if (!item) throw new Error(`audio index ${audioIndex} not mapped`);
  return item.visualIndex;
}

describe('findTrackedDownbeatIndex', () => {
  it('returns the beat index of the first tracked downbeat', () => {
    expect(findTrackedDownbeatIndex(analysis(), beatTimes, 4)).toBe(1);
  });

  it('tolerates small timing differences between downbeats and beats', () => {
    expect(findTrackedDownbeatIndex(analysis({ downbeats: [0.53, 2.47, 4.5, 6.52] }), beatTimes, 4)).toBe(1);
  });

  it('ignores models whose downbeats are guesses', () => {
    expect(findTrackedDownbeatIndex(analysis({ beatModel: 'madmom' }), beatTimes, 4)).toBeNull();
  });

  it('ignores downbeats that do not match the bar length', () => {
    expect(findTrackedDownbeatIndex(analysis(), beatTimes, 3)).toBeNull();
    expect(findTrackedDownbeatIndex(analysis({ downbeats: [0.5, 1.5, 4.5, 5.0] }), beatTimes, 4)).toBeNull();
  });

  it('needs at least two downbeats', () => {
    expect(findTrackedDownbeatIndex(analysis({ downbeats: [0.5] }), beatTimes, 4)).toBeNull();
  });
});

describe('getChordGridData with tracked downbeats', () => {
  it('starts bars on the tracked downbeats', () => {
    const grid = getChordGridData(analysis());
    for (const audioIndex of [1, 5, 9, 13]) {
      expect(visualIndexOf(grid, audioIndex) % 4).toBe(0);
    }
  });

  it('keeps the chord-based guess for madmom', () => {
    const grid = getChordGridData(analysis({ beatModel: 'madmom' }));
    expect(visualIndexOf(grid, 0) % 4).toBe(0);
  });
});
