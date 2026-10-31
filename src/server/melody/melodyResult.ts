import 'server-only';
import {
  MELODY_PIPELINE_VERSION,
  type InstrumentNoteEvent,
  type SheetSageNoteEvent,
  type SheetSageResult,
} from '@/types/sheetSage';
import { instrumentGroupOf } from '@/utils/instrumentGroups';

export const VOCAL_ENGINE = 'basic-pitch@scnet-vocals';
/** Label stored for legacy results produced by Basic Pitch on the full mix. */
export const LEGACY_MIX_ENGINE = 'basic-pitch@mix';
/** MuScriptor emits no velocity; instrument layers use a fixed one. */
const INSTRUMENT_VELOCITY = 80;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeNotes(notes: unknown): SheetSageNoteEvent[] {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter((note) => isFiniteNumber(note?.onset) && isFiniteNumber(note?.offset)
      && isFiniteNumber(note?.pitch) && isFiniteNumber(note?.velocity))
    .sort((left, right) => left.onset - right.onset || left.pitch - right.pitch || left.offset - right.offset)
    .map((note) => ({
      onset: note.onset,
      offset: Math.max(note.offset, note.onset),
      pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
      velocity: Math.max(0, Math.min(127, Math.round(note.velocity))),
    }));
}

export function toInstrumentNotes(
  notes: Array<{ onset: number; offset: number; pitch: number; instrument: string }>,
): InstrumentNoteEvent[] {
  return notes
    .filter((note) => isFiniteNumber(note?.onset) && isFiniteNumber(note?.offset) && isFiniteNumber(note?.pitch)
      && typeof note.instrument === 'string')
    .map((note) => ({
      onset: note.onset,
      offset: Math.max(note.offset, note.onset),
      pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
      velocity: INSTRUMENT_VELOCITY,
      instrument: note.instrument,
      group: instrumentGroupOf(note.instrument),
    }));
}

/** Sanitize a melody result before caching it in the `melodies` table. */
export function normalizeMelodyResultForCache(videoId: string, result: SheetSageResult) {
  const noteEvents = normalizeNotes(result.noteEvents);
  const engines = result.engines ?? { vocal: LEGACY_MIX_ENGINE };
  return {
    ...result,
    source: 'sheetsage' as const,
    videoId,
    engines,
    model: [engines.vocal, engines.instruments].filter(Boolean).join('+'),
    createdAt: new Date().toISOString(),
    noteEvents,
    noteEventCount: noteEvents.length,
    beatTimes: Array.isArray(result.beatTimes) ? result.beatTimes.filter(isFiniteNumber) : [],
    beatsPerMeasure: isFiniteNumber(result.beatsPerMeasure) && result.beatsPerMeasure > 0 ? result.beatsPerMeasure : 4,
    tempoBpm: isFiniteNumber(result.tempoBpm) && result.tempoBpm > 0 ? result.tempoBpm : 120,
  };
}

export function buildMelodyV2Result(input: {
  vocal: SheetSageResult;
  instruments: { model: string; notes: Array<{ onset: number; offset: number; pitch: number; instrument: string }> };
  processingTime: number;
}): SheetSageResult {
  const instrumentNotes = toInstrumentNotes(input.instruments.notes);
  return {
    ...input.vocal,
    source: 'sheetsage',
    pipelineVersion: MELODY_PIPELINE_VERSION,
    engines: { vocal: VOCAL_ENGINE, instruments: input.instruments.model },
    vocalInput: 'stem:vocals',
    instrumentNotes,
    processingTime: input.processingTime,
    usedJukebox: false,
  };
}
