// Pure synchronization logic for chord-to-beat alignment
// Stateless and independently testable

import type { BeatInfo, ChordDetectionResult } from '@/types/audioAnalysis';
import {
  beatGridDebugLog,
  beatGridDebugVerboseLog,
  isBeatGridDebugEnabled,
} from '@/utils/debug/beatGridDebug';

/**
 * OPTIMIZED: Chord-to-beat alignment using two-pointer technique
 *
 * PERFORMANCE IMPROVEMENT: O(n*m) -> O(n+m) where n=chords, m=beats
 * VALIDATION STATUS: Identical results to previous algorithm in this codebase
 */
/**
 * Chord onsets from the models lag the downbeat a little (BTC: median +0.065s,
 * upper quartile +0.15s on measured songs). With short beats (fast tempo or
 * 6/8 eighth-note beats) half a beat is narrower than that lag, so a change that
 * belongs on the downbeat lands one beat late. When the beat model gives
 * downbeats, an onset that falls on the beat right after a downbeat and is at
 * most DOWNBEAT_SNAP_SECONDS late is moved back onto the downbeat.
 * Only applied when beats are shorter than DOWNBEAT_SNAP_MAX_BEAT_SECONDS:
 * for longer beats half a beat already covers that lag.
 */
const DOWNBEAT_SNAP_SECONDS = 0.25;
const DOWNBEAT_SNAP_MAX_BEAT_SECONDS = 0.4;
const DOWNBEAT_MATCH_SECONDS = 0.05;

function findDownbeatIndices(beats: BeatInfo[], downbeats?: number[]): Set<number> {
  const result = new Set<number>();
  if (!Array.isArray(downbeats) || downbeats.length === 0) return result;
  let d = 0;
  for (let i = 0; i < beats.length; i++) {
    const t = beats[i].time;
    while (d < downbeats.length && downbeats[d] < t - DOWNBEAT_MATCH_SECONDS) d++;
    if (d < downbeats.length && Math.abs(downbeats[d] - t) <= DOWNBEAT_MATCH_SECONDS) result.add(i);
  }
  return result;
}

function alignChordsToBeatsDirectly(
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  downbeats?: number[]
): { chord: string; beatIndex: number }[] {
  if (chords.length === 0 || beats.length === 0) {
    return [];
  }

  const beatToChordMap = new Map<number, string>();
  const downbeatIndices = findDownbeatIndices(beats, downbeats);
  let beatIndex = 0; // Two-pointer technique: maintain beat position
  const debugEnabled = isBeatGridDebugEnabled();
  const mappingSamples: Array<{
    chord: string;
    chordStart: number;
    mappedBeatIndex: number;
    mappedBeatTime: number;
    beatDuration: number;
  }> = [];

  // Two-pointer algorithm - advance both pointers simultaneously
  for (const chord of chords) {
    const chordStart = chord.start;
    const chordName = chord.chord === 'N' ? 'N/C' : chord.chord;

    const beatDuration = beatIndex < beats.length - 1
      ? beats[beatIndex + 1].time - beats[beatIndex].time
      : beatIndex > 0
        ? beats[beatIndex].time - beats[beatIndex - 1].time
        : 0;

    // Instead of finding the closest beat, advance to the next beat only once
    // the chord onset reaches the midpoint before that next beat.
    while (
      beatIndex < beats.length - 1 &&
      beats[beatIndex + 1].time - beatDuration * 0.5 <= chordStart
    ) {
      beatIndex++;
    }

    let targetIndex = beatIndex;
    if (
      beatIndex > 0 &&
      downbeatIndices.has(beatIndex - 1) &&
      !beatToChordMap.has(beatIndex - 1) &&
      beats[beatIndex].time - beats[beatIndex - 1].time < DOWNBEAT_SNAP_MAX_BEAT_SECONDS &&
      chordStart - beats[beatIndex - 1].time <= DOWNBEAT_SNAP_SECONDS
    ) {
      targetIndex = beatIndex - 1;
    }

    // Map this beat to the chord
    beatToChordMap.set(targetIndex, chordName);

    if (debugEnabled && mappingSamples.length < 24) {
      mappingSamples.push({
        chord: chordName,
        chordStart,
        mappedBeatIndex: targetIndex,
        mappedBeatTime: beats[targetIndex]?.time ?? 0,
        beatDuration,
      });
    }
  }

  // Create synchronized chords by forward-filling chord names
  const synchronizedChords: { chord: string; beatIndex: number }[] = [];
  let lastChord = 'N/C';

  for (let i = 0; i < beats.length; i++) {
    const chordName = beatToChordMap.get(i) || lastChord;
    synchronizedChords.push({ chord: chordName, beatIndex: i });
    lastChord = chordName;
  }

  if (debugEnabled) {
    beatGridDebugLog('ChordSync', 'Chord-to-beat alignment summary', {
      chordCount: chords.length,
      beatCount: beats.length,
      mappedBeatCount: beatToChordMap.size,
      mappingSamples,
    });

    beatGridDebugVerboseLog(
      'ChordSync',
      'Final synchronized chords (first 48)',
      synchronizedChords.slice(0, 48)
    );
  }

  return synchronizedChords;
}

/**
 * Public API: Pure model output synchronization
 */
export const synchronizeChords = (
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  downbeats?: number[]
) => {
  if (chords.length === 0 || beats.length === 0) {
    return [] as { chord: string; beatIndex: number }[];
  }

  return alignChordsToBeatsDirectly(chords, beats, downbeats);
};
