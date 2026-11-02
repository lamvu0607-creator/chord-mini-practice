import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { LyricsData } from '@/types/musicAiTypes';
import type { InstrumentGroup, MelodyJobStage, MelodyLayer, SheetSageResult } from '@/types/sheetSage';
import { DEFAULT_ENABLED_INSTRUMENT_GROUPS, INSTRUMENT_GROUP_ORDER } from '@/utils/instrumentGroups';

/** Live status of a melody v2 background job, shown in the melody toast. */
export interface SheetSageJobStatus {
  stage: MelodyJobStage;
  progress?: number | null;
  queuePosition?: number;
}

const INSTRUMENT_GROUPS_STORAGE_KEY = 'chordmini.melody.instrumentGroups';

function readEnabledInstrumentGroups(): InstrumentGroup[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(INSTRUMENT_GROUPS_STORAGE_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      return INSTRUMENT_GROUP_ORDER.filter((group) => parsed.includes(group));
    }
  } catch {
    // Private mode or corrupted value: fall back to the defaults.
  }
  return [...DEFAULT_ENABLED_INSTRUMENT_GROUPS];
}

function writeEnabledInstrumentGroups(groups: InstrumentGroup[]): void {
  try {
    window.localStorage.setItem(INSTRUMENT_GROUPS_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // Storage unavailable; the choice just won't persist.
  }
}

export type PianoRollRangeMode = 'fit' | 'full';
export type PianoRollHeight = 280 | 420 | 600;

const PIANO_ROLL_RANGE_STORAGE_KEY = 'chordmini.pianoRoll.rangeMode';
const PIANO_ROLL_HEIGHT_STORAGE_KEY = 'chordmini.pianoRoll.height';

function readStoredString(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStoredString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable; the choice just won't persist.
  }
}

function readPianoRollRangeMode(): PianoRollRangeMode {
  return readStoredString(PIANO_ROLL_RANGE_STORAGE_KEY) === 'full' ? 'full' : 'fit';
}

function readPianoRollHeight(): PianoRollHeight {
  const stored = Number(readStoredString(PIANO_ROLL_HEIGHT_STORAGE_KEY));
  return stored === 280 || stored === 600 ? stored : 420;
}

// Identity wrapper to disable devtools middleware in production with proper typing
function identityDevtools<S, Mps extends [] = [], Mcs extends [] = []>(
  fn: import('zustand/vanilla').StateCreator<S, Mps, Mcs>
) {
  return fn;
}

interface AnalysisStore {
  // Analysis results
  analysisResults: AnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;

  // Model state
  beatDetector: string;
  chordDetector: string;
  modelsInitialized: boolean;

  // Cache state
  cacheAvailable: boolean;
  cacheCheckCompleted: boolean;
  cacheCheckInProgress: boolean;

  // Lyrics state
  lyrics: LyricsData | null;
  showLyrics: boolean;
  hasCachedLyrics: boolean;
  isTranscribingLyrics: boolean;
  lyricsError: string | null;

  // Key detection state
  keySignature: string | null;
  isDetectingKey: boolean;

  // Chord corrections state
  chordCorrections: Record<string, string> | null;
  showCorrectedChords: boolean;

  // SheetSage state
  sheetSageResult: SheetSageResult | null;
  isComputingSheetSage: boolean;
  sheetSageError: string | null;
  isCheckingSheetSageBackend: boolean;
  isSheetSageBackendAvailable: boolean | null;
  sheetSageBackendError: string | null;
  sheetSageJobStatus: SheetSageJobStatus | null;
  /** Instrument layers (MuScriptor groups) shown in the piano roll; the vocal line is always shown. */
  enabledInstrumentGroups: InstrumentGroup[];
  /** Layer kept at full strength in the piano roll while the others are dimmed; visual only. */
  focusedMelodyLayer: MelodyLayer | null;
  pianoRollRangeMode: PianoRollRangeMode;
  pianoRollHeight: PianoRollHeight;

  // Analysis operations
  startAnalysis: () => void;
  completeAnalysis: (results: AnalysisResult) => void;
  failAnalysis: (error: string) => void;
  resetAnalysis: () => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setAnalysisResults: (results: AnalysisResult | null) => void;
  setAnalysisError: (error: string | null) => void;

  // Model operations
  setBeatDetector: (detector: string) => void;
  setChordDetector: (detector: string) => void;
  setModelsInitialized: (initialized: boolean) => void;

  // Cache operations
  setCacheAvailable: (available: boolean) => void;
  setCacheCheckCompleted: (completed: boolean) => void;
  setCacheCheckInProgress: (inProgress: boolean) => void;

  // Lyrics operations
  startLyricsTranscription: () => void;
  completeLyricsTranscription: (lyricsData: LyricsData) => void;
  failLyricsTranscription: (error: string) => void;
  toggleLyricsVisibility: () => void;
  setLyrics: (lyrics: LyricsData | null) => void;
  setShowLyrics: (show: boolean) => void;
  setHasCachedLyrics: (hasCached: boolean) => void;
  setIsTranscribingLyrics: (isTranscribing: boolean) => void;
  setLyricsError: (error: string | null) => void;

  // Key detection operations
  setKeySignature: (key: string | null) => void;
  setIsDetectingKey: (detecting: boolean) => void;

  // Chord corrections operations
  setChordCorrections: (corrections: Record<string, string> | null) => void;
  setShowCorrectedChords: (show: boolean) => void;

  // SheetSage operations
  setSheetSageResult: (result: SheetSageResult | null) => void;
  setIsComputingSheetSage: (computing: boolean) => void;
  setSheetSageError: (error: string | null) => void;
  setIsCheckingSheetSageBackend: (checking: boolean) => void;
  setIsSheetSageBackendAvailable: (available: boolean | null) => void;
  setSheetSageBackendError: (error: string | null) => void;
  setSheetSageJobStatus: (status: SheetSageJobStatus | null) => void;
  toggleInstrumentGroup: (group: InstrumentGroup) => void;
  /** Focus a layer, or clear focus when it is already focused. Focusing a hidden group shows it. */
  toggleMelodyLayerFocus: (layer: MelodyLayer) => void;
  setPianoRollRangeMode: (mode: PianoRollRangeMode) => void;
  setPianoRollHeight: (height: PianoRollHeight) => void;
  clearSheetSage: () => void;
}

export const useAnalysisStore = create<AnalysisStore>()(
  ((process.env.NODE_ENV !== 'production' ? devtools : identityDevtools) as unknown as typeof devtools)(
    (set) => ({
      // Initial state
      analysisResults: null,
      isAnalyzing: false,
      analysisError: null,
      beatDetector: 'auto',
      chordDetector: 'auto',
      modelsInitialized: false,
      cacheAvailable: false,
      cacheCheckCompleted: false,
      cacheCheckInProgress: false,
      lyrics: null,
      showLyrics: false,
      hasCachedLyrics: false,
      isTranscribingLyrics: false,
      lyricsError: null,
      keySignature: null,
      isDetectingKey: false,
      chordCorrections: null,
      showCorrectedChords: false,
      sheetSageResult: null,
      isComputingSheetSage: false,
      sheetSageError: null,
      isCheckingSheetSageBackend: false,
      isSheetSageBackendAvailable: null,
      sheetSageBackendError: null,
      sheetSageJobStatus: null,
      enabledInstrumentGroups: readEnabledInstrumentGroups(),
      focusedMelodyLayer: null,
      pianoRollRangeMode: readPianoRollRangeMode(),
      pianoRollHeight: readPianoRollHeight(),

      // Analysis operations
      startAnalysis: () =>
        set(
          {
            isAnalyzing: true,
            analysisError: null,
          },
          false,
          'startAnalysis'
        ),

      completeAnalysis: (results) =>
        set(
          {
            analysisResults: results,
            isAnalyzing: false,
            analysisError: null,
          },
          false,
          'completeAnalysis'
        ),

      failAnalysis: (error) =>
        set(
          {
            isAnalyzing: false,
            analysisError: error,
          },
          false,
          'failAnalysis'
        ),

      resetAnalysis: () =>
        set(
          {
            analysisResults: null,
            isAnalyzing: false,
            analysisError: null,
            keySignature: null,
            isDetectingKey: false,
            chordCorrections: null,
            lyrics: null,
            showLyrics: false,
            hasCachedLyrics: false,
            isTranscribingLyrics: false,
            lyricsError: null,
            sheetSageResult: null,
            isComputingSheetSage: false,
            sheetSageError: null,
            isCheckingSheetSageBackend: false,
            isSheetSageBackendAvailable: null,
            sheetSageBackendError: null,
            sheetSageJobStatus: null,
            focusedMelodyLayer: null,
          },
          false,
          'resetAnalysis'
        ),

      setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }, false, 'setIsAnalyzing'),

      setAnalysisResults: (results) => set({ analysisResults: results }, false, 'setAnalysisResults'),

      setAnalysisError: (error) => set({ analysisError: error }, false, 'setAnalysisError'),

      // Model operations
      setBeatDetector: (detector) => set({ beatDetector: detector }, false, 'setBeatDetector'),

      setChordDetector: (detector) => set({ chordDetector: detector }, false, 'setChordDetector'),

      setModelsInitialized: (initialized) => set({ modelsInitialized: initialized }, false, 'setModelsInitialized'),

      // Cache operations
      setCacheAvailable: (available) => set({ cacheAvailable: available }, false, 'setCacheAvailable'),

      setCacheCheckCompleted: (completed) => set({ cacheCheckCompleted: completed }, false, 'setCacheCheckCompleted'),

      setCacheCheckInProgress: (inProgress) =>
        set({ cacheCheckInProgress: inProgress }, false, 'setCacheCheckInProgress'),

      // Lyrics operations
      startLyricsTranscription: () =>
        set(
          {
            isTranscribingLyrics: true,
            lyricsError: null,
          },
          false,
          'startLyricsTranscription'
        ),

      completeLyricsTranscription: (lyricsData) =>
        set(
          {
            lyrics: lyricsData,
            isTranscribingLyrics: false,
            lyricsError: null,
            showLyrics: true,
          },
          false,
          'completeLyricsTranscription'
        ),

      failLyricsTranscription: (error) =>
        set(
          {
            isTranscribingLyrics: false,
            lyricsError: error,
          },
          false,
          'failLyricsTranscription'
        ),

      toggleLyricsVisibility: () =>
        set((state) => ({ showLyrics: !state.showLyrics }), false, 'toggleLyricsVisibility'),

      setLyrics: (lyrics) => set({ lyrics }, false, 'setLyrics'),

      setShowLyrics: (show) => set({ showLyrics: show }, false, 'setShowLyrics'),

      setHasCachedLyrics: (hasCached) => set({ hasCachedLyrics: hasCached }, false, 'setHasCachedLyrics'),

      setIsTranscribingLyrics: (isTranscribing) =>
        set({ isTranscribingLyrics: isTranscribing }, false, 'setIsTranscribingLyrics'),

      setLyricsError: (error) => set({ lyricsError: error }, false, 'setLyricsError'),

      // Key detection operations
      setKeySignature: (key) => set({ keySignature: key }, false, 'setKeySignature'),

      setIsDetectingKey: (detecting) => set({ isDetectingKey: detecting }, false, 'setIsDetectingKey'),

      // Chord corrections operations
      setChordCorrections: (corrections) => set({ chordCorrections: corrections }, false, 'setChordCorrections'),

      setShowCorrectedChords: (show) => set({ showCorrectedChords: show }, false, 'setShowCorrectedChords'),

      // SheetSage operations
      setSheetSageResult: (result) => set({ sheetSageResult: result }, false, 'setSheetSageResult'),

      setIsComputingSheetSage: (computing) =>
        set({ isComputingSheetSage: computing }, false, 'setIsComputingSheetSage'),

      setSheetSageError: (error) => set({ sheetSageError: error }, false, 'setSheetSageError'),

      setIsCheckingSheetSageBackend: (checking) =>
        set({ isCheckingSheetSageBackend: checking }, false, 'setIsCheckingSheetSageBackend'),

      setIsSheetSageBackendAvailable: (available) =>
        set({ isSheetSageBackendAvailable: available }, false, 'setIsSheetSageBackendAvailable'),

      setSheetSageBackendError: (error) =>
        set({ sheetSageBackendError: error }, false, 'setSheetSageBackendError'),

      setSheetSageJobStatus: (status) => set({ sheetSageJobStatus: status }, false, 'setSheetSageJobStatus'),

      toggleInstrumentGroup: (group) =>
        set(
          (state) => {
            const enabled = state.enabledInstrumentGroups.includes(group)
              ? state.enabledInstrumentGroups.filter((entry) => entry !== group)
              : INSTRUMENT_GROUP_ORDER.filter((entry) => entry === group || state.enabledInstrumentGroups.includes(entry));
            writeEnabledInstrumentGroups(enabled);
            return {
              enabledInstrumentGroups: enabled,
              focusedMelodyLayer:
                state.focusedMelodyLayer === group && !enabled.includes(group) ? null : state.focusedMelodyLayer,
            };
          },
          false,
          'toggleInstrumentGroup'
        ),

      toggleMelodyLayerFocus: (layer) =>
        set(
          (state) => {
            if (state.focusedMelodyLayer === layer) {
              return { focusedMelodyLayer: null };
            }
            const group = INSTRUMENT_GROUP_ORDER.find((entry) => entry === layer);
            if (!group || state.enabledInstrumentGroups.includes(group)) {
              return { focusedMelodyLayer: layer };
            }
            const enabled = INSTRUMENT_GROUP_ORDER.filter(
              (entry) => entry === group || state.enabledInstrumentGroups.includes(entry),
            );
            writeEnabledInstrumentGroups(enabled);
            return { focusedMelodyLayer: layer, enabledInstrumentGroups: enabled };
          },
          false,
          'toggleMelodyLayerFocus'
        ),

      setPianoRollRangeMode: (mode) => {
        writeStoredString(PIANO_ROLL_RANGE_STORAGE_KEY, mode);
        set({ pianoRollRangeMode: mode }, false, 'setPianoRollRangeMode');
      },

      setPianoRollHeight: (height) => {
        writeStoredString(PIANO_ROLL_HEIGHT_STORAGE_KEY, String(height));
        set({ pianoRollHeight: height }, false, 'setPianoRollHeight');
      },

      clearSheetSage: () =>
        set(
          {
            sheetSageResult: null,
            isComputingSheetSage: false,
            sheetSageError: null,
            sheetSageJobStatus: null,
            focusedMelodyLayer: null,
          },
          false,
          'clearSheetSage'
        ),
    }),
    { name: 'AnalysisStore' }
  )
);

// Selector hooks for optimized re-renders
export const useAnalysisResults = () => useAnalysisStore((state) => state.analysisResults);
export const useIsAnalyzing = () => useAnalysisStore((state) => state.isAnalyzing);
export const useAnalysisError = () => useAnalysisStore((state) => state.analysisError);

export const useBeatDetector = () => useAnalysisStore((state) => state.beatDetector);
export const useChordDetector = () => useAnalysisStore((state) => state.chordDetector);
export const useModelsInitialized = () => useAnalysisStore((state) => state.modelsInitialized);

export const useCacheState = () =>
  useAnalysisStore(useShallow((state) => ({
    cacheAvailable: state.cacheAvailable,
    cacheCheckCompleted: state.cacheCheckCompleted,
    cacheCheckInProgress: state.cacheCheckInProgress,
  })));

export const useLyrics = () => useAnalysisStore((state) => state.lyrics);
export const useShowLyrics = () => useAnalysisStore((state) => state.showLyrics);
export const useHasCachedLyrics = () => useAnalysisStore((state) => state.hasCachedLyrics);
export const useIsTranscribingLyrics = () => useAnalysisStore((state) => state.isTranscribingLyrics);
export const useLyricsError = () => useAnalysisStore((state) => state.lyricsError);

export const useKeySignature = () => useAnalysisStore((state) => state.keySignature);
export const useIsDetectingKey = () => useAnalysisStore((state) => state.isDetectingKey);

export const useChordCorrections = () => useAnalysisStore((state) => state.chordCorrections);
export const useShowCorrectedChords = () => useAnalysisStore((state) => state.showCorrectedChords);
export const useSheetSageResult = () => useAnalysisStore((state) => state.sheetSageResult);
export const useIsComputingSheetSage = () => useAnalysisStore((state) => state.isComputingSheetSage);
export const useSheetSageError = () => useAnalysisStore((state) => state.sheetSageError);
export const useIsCheckingSheetSageBackend = () => useAnalysisStore((state) => state.isCheckingSheetSageBackend);
export const useIsSheetSageBackendAvailable = () => useAnalysisStore((state) => state.isSheetSageBackendAvailable);
export const useSheetSageBackendError = () => useAnalysisStore((state) => state.sheetSageBackendError);
export const useSheetSageJobStatus = () => useAnalysisStore((state) => state.sheetSageJobStatus);
export const useEnabledInstrumentGroups = () => useAnalysisStore((state) => state.enabledInstrumentGroups);
export const useFocusedMelodyLayer = () => useAnalysisStore((state) => state.focusedMelodyLayer);
export const usePianoRollRangeMode = () => useAnalysisStore((state) => state.pianoRollRangeMode);
export const usePianoRollHeight = () => useAnalysisStore((state) => state.pianoRollHeight);

// Action selectors
export const useAnalysisActions = () =>
  useAnalysisStore(useShallow((state) => ({
    startAnalysis: state.startAnalysis,
    completeAnalysis: state.completeAnalysis,
    failAnalysis: state.failAnalysis,
    resetAnalysis: state.resetAnalysis,
  })));

export const useModelActions = () =>
  useAnalysisStore(useShallow((state) => ({
    setBeatDetector: state.setBeatDetector,
    setChordDetector: state.setChordDetector,
    setModelsInitialized: state.setModelsInitialized,
  })));

export const useLyricsActions = () =>
  useAnalysisStore(useShallow((state) => ({
    startLyricsTranscription: state.startLyricsTranscription,
    completeLyricsTranscription: state.completeLyricsTranscription,
    failLyricsTranscription: state.failLyricsTranscription,
    toggleLyricsVisibility: state.toggleLyricsVisibility,
    setLyrics: state.setLyrics,
    setHasCachedLyrics: state.setHasCachedLyrics,
  })));

export const useSheetSageActions = () =>
  useAnalysisStore(useShallow((state) => ({
    setSheetSageResult: state.setSheetSageResult,
    setIsComputingSheetSage: state.setIsComputingSheetSage,
    setSheetSageError: state.setSheetSageError,
    setIsCheckingSheetSageBackend: state.setIsCheckingSheetSageBackend,
    setIsSheetSageBackendAvailable: state.setIsSheetSageBackendAvailable,
    setSheetSageBackendError: state.setSheetSageBackendError,
    setSheetSageJobStatus: state.setSheetSageJobStatus,
    toggleInstrumentGroup: state.toggleInstrumentGroup,
    clearSheetSage: state.clearSheetSage,
  })));
