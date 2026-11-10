import type { BeatInfo } from '@/services/audio/beatDetectionService';
import type { ChordDetectionResult } from '@/services/chord-analysis/chordRecognitionService';
import type { SheetSageResult } from '@/types/sheetSage';

export type RomanNumeralData = {
  analysis: string[];
  keyContext: string;
  temporalShifts?: Array<{ chordIndex: number; targetKey: string; romanNumeral: string }>;
};

export type SequenceCorrectionsData = {
  originalSequence: string[];
  correctedSequence: string[];
  keyAnalysis?: {
    sections: Array<{ startIndex: number; endIndex: number; key: string; chords: string[] }>;
    modulations?: Array<{ fromKey: string; toKey: string; atIndex: number; atTime?: number }>;
  };
  romanNumerals?: RomanNumeralData | null;
} | null;

export interface TranscriptionData {
  videoId: string;
  title?: string;
  channelTitle?: string;
  thumbnail?: string;
  audioUrl?: string | null;
  beatModel: string;
  chordModel: string;
  beats: BeatInfo[];
  chords: ChordDetectionResult[];
  downbeats?: number[];
  downbeats_with_measures?: Array<{ time: number; measureNum: number }>;
  synchronizedChords: Array<{ chord: string; beatIndex: number; beatNum?: number; source?: string }>;
  createdAt: number;
  audioDuration?: number;
  totalProcessingTime?: number;
  timeSignature?: number | null;
  bpm?: number | null;
  beatShift?: number;
  keySignature?: string | null;
  keyModulation?: string | null;
  /** Key estimated from the audio by the chord model (see AnalysisResult.audioKey) */
  audioKey?: string | null;
  audioKeyConfidence?: number | null;
  chordDecoding?: 'beat-sync' | 'frame' | null;
  chordCorrections?: Record<string, string> | null;
  sequenceCorrections?: SequenceCorrectionsData;
  correctedChords?: string[] | null;
  originalChords?: string[] | null;
  primaryKey?: string | null;
  modulation?: string | null;
  corrections?: Record<string, string> | null;
  rawResponse?: string | null;
  romanNumerals?: RomanNumeralData | null;
  isPrimaryVariant?: boolean;
  displayPriority?: number | null;
  searchableKeys?: string[];
  usageCount?: number;
}

export interface MelodyTranscriptionData extends SheetSageResult {
  videoId: string;
  model: string;
  createdAt: number;
}

export interface TranscriptionEnrichmentUpdate {
  title?: string | null;
  channelTitle?: string | null;
  thumbnail?: string | null;
  keySignature?: string | null;
  keyModulation?: string | null;
  chordCorrections?: Record<string, string> | null;
  sequenceCorrections?: SequenceCorrectionsData;
  correctedChords?: string[] | null;
  originalChords?: string[] | null;
  romanNumerals?: RomanNumeralData | null;
}

export function buildTranscriptionId(videoId: string, beatModel: string, chordModel: string) {
  return `${videoId}_${beatModel}_${chordModel}`;
}
