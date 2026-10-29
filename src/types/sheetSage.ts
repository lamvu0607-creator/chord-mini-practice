export interface SheetSageNoteEvent {
  onset: number;
  offset: number;
  pitch: number;
  velocity: number;
  intervalTag?: string;
  leadPitch?: number;
}

export interface SheetSageResult {
  source: 'sheetsage';
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
