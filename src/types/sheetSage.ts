export interface SheetSageNoteEvent {
  onset: number;
  offset: number;
  pitch: number;
  velocity: number;
  intervalTag?: string;
  leadPitch?: number;
}

/** Instrument groups shown as separate piano-roll layers (see src/utils/instrumentGroups.ts). */
export type InstrumentGroup = 'guitar' | 'keys' | 'bass' | 'brass_winds' | 'strings' | 'synth' | 'other';

export interface InstrumentNoteEvent extends SheetSageNoteEvent {
  /** MuScriptor MT3_FULL_PLUS group name, e.g. `distorted_electric_guitar`. */
  instrument: string;
  group: InstrumentGroup;
}

/** Melody v2: `noteEvents` = vocal line (SCNet vocals stem → Basic Pitch), `instrumentNotes` = MuScriptor. */
export const MELODY_PIPELINE_VERSION = 2;

export interface MelodyEngines {
  vocal: string;
  instruments?: string;
}

export type MelodyJobStage = 'queued' | 'waiting_stems' | 'vocal' | 'instruments' | 'done';
export type MelodyJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface MelodyJob {
  jobId: string;
  videoId: string;
  status: MelodyJobStatus;
  stage: MelodyJobStage;
  /** 0..1 within the current stage, when known. */
  progress?: number | null;
  error?: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SheetSageResult {
  source: 'sheetsage';
  pipelineVersion?: number;
  engines?: MelodyEngines;
  model?: string;
  /** Where the vocal notes came from: an SCNet vocals stem, or the full mix (legacy). */
  vocalInput?: 'stem:vocals' | 'mix';
  instrumentNotes?: InstrumentNoteEvent[];
  sourceName?: string | null;
  mode?: 'vocal' | 'lead' | 'guitar';
  noteEvents: SheetSageNoteEvent[];
  noteEventCount: number;
  leadNotes?: SheetSageNoteEvent[];
  harmonyNotes?: SheetSageNoteEvent[];
  hasHarmony?: boolean;
  totalLeadNotes?: number;
  totalHarmonyNotes?: number;
  stems?: {
    vocalsPath?: string;
    accompanimentPath?: string;
    cached?: boolean;
  };
  beatTimes: number[];
  beatsPerMeasure: number;
  tempoBpm: number;
  processingTime?: number;
  usedJukebox: boolean;
}
