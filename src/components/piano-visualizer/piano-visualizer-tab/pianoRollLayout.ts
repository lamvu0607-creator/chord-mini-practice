import type { PianoRollRangeMode } from '@/stores/analysisStore';
import type { MelodyLayer } from '@/types/sheetSage';
import { PIANO_END_MIDI, PIANO_START_MIDI } from './constants';

export interface PianoRange {
  startMidi: number;
  endMidi: number;
}

export interface BeatLine {
  startTime: number;
  endTime: number;
  /** 1-based measure number on a downbeat; absent on other beats. */
  measureNumber?: number;
}

const FULL_RANGE: PianoRange = { startMidi: PIANO_START_MIDI, endMidi: PIANO_END_MIDI };
const MIN_FIT_SEMITONES = 24;
const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const MIN_WHITE_KEY_WIDTH = 10;
const MAX_WHITE_KEY_WIDTH = 40;
const FALLBACK_WHITE_KEY_WIDTH = 14;

/**
 * Keyboard range for the piano roll. `fit` widens the notes' min/max to whole octaves (C to B), at
 * least two octaves wide. It never crops to percentiles: the canvas drops notes outside its range.
 */
export function computePianoRange(
  notes: ReadonlyArray<{ midi: number }>,
  mode: PianoRollRangeMode,
): PianoRange {
  if (mode === 'full') return FULL_RANGE;

  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  for (const { midi } of notes) {
    if (midi < PIANO_START_MIDI || midi > PIANO_END_MIDI) continue;
    lowest = Math.min(lowest, midi);
    highest = Math.max(highest, midi);
  }
  if (!Number.isFinite(lowest)) return FULL_RANGE;

  const octaveStart = lowest - (lowest % 12);
  let octaveEnd = highest - (highest % 12) + 11;
  while (octaveEnd - octaveStart + 1 < MIN_FIT_SEMITONES) {
    octaveEnd += 12;
  }

  return {
    startMidi: Math.max(PIANO_START_MIDI, octaveStart),
    endMidi: Math.min(PIANO_END_MIDI, octaveEnd),
  };
}

export function countWhiteKeys({ startMidi, endMidi }: PianoRange): number {
  let count = 0;
  for (let midi = startMidi; midi <= endMidi; midi += 1) {
    if (!BLACK_KEY_PITCH_CLASSES.has(midi % 12)) count += 1;
  }
  return count;
}

export function computeWhiteKeyWidth(containerWidth: number, whiteKeyCount: number): number {
  if (containerWidth <= 0 || whiteKeyCount <= 0) return FALLBACK_WHITE_KEY_WIDTH;
  const calculated = Math.floor(containerWidth / whiteKeyCount);
  return Math.max(MIN_WHITE_KEY_WIDTH, Math.min(MAX_WHITE_KEY_WIDTH, calculated));
}

/**
 * Beat lines from the chord grid. Downbeats use the grid index modulo the time signature, the same
 * rule as the chord strip's measure separators, so both views agree.
 */
export function buildBeatLines(
  beats: ReadonlyArray<number | null> | undefined,
  timeSignature: number,
): BeatLine[] {
  if (!beats?.length) return [];
  const beatsPerMeasure = Math.max(1, Math.round(timeSignature) || 4);
  const lines: BeatLine[] = [];

  beats.forEach((time, index) => {
    if (typeof time !== 'number' || !Number.isFinite(time)) return;
    const isDownbeat = index % beatsPerMeasure === 0;
    lines.push({
      startTime: time,
      endTime: time,
      ...(isDownbeat ? { measureNumber: Math.floor(index / beatsPerMeasure) + 1 } : {}),
    });
  });

  return lines.sort((left, right) => left.startTime - right.startTime);
}

/** Paint order, low to high: dimmed layers, accompaniment, harmony, vocal, focused layer. */
export function getNoteDrawRank(layer: MelodyLayer | undefined, focusedLayer: MelodyLayer | null): number {
  if (focusedLayer) {
    return layer === focusedLayer ? 4 : 0;
  }
  if (layer === 'vocal') return 3;
  if (layer === 'harmony') return 2;
  return 1;
}
