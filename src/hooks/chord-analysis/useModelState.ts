import { useState, useEffect, useRef } from 'react';
import {
  getDefaultBeatModel,
  getDefaultChordModel,
  getSafeBeatModel,
  getSafeChordModel,
  isBeatDetectorType,
  isChordDetectorType,
} from '@/utils/modelFiltering';

// Define detector types
export type BeatDetectorType = 'beat-this' | 'madmom' | 'beat-transformer';
export type ChordDetectorType = 'btc-cl' | 'btc-sl' | 'btc-pl' | 'chord-cnn-lstm';

const BEAT_STORAGE_KEY = 'chordmini_beat_detector';
const CHORD_STORAGE_KEY = 'chordmini_chord_detector';
const DEFAULTS_VERSION_KEY = 'chordmini_model_defaults_version';
const DEFAULTS_VERSION = '2';
// Defaults before version 2. The selection is persisted on every visit, so these values
// usually mean "never changed" rather than a deliberate choice.
const PREVIOUS_DEFAULT_BEAT_MODELS = ['madmom', 'auto'];
const PREVIOUS_DEFAULT_CHORD_MODELS = ['btc-sl', 'btc-pl', 'chord-cnn-lstm'];

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * One-time move to the version-2 defaults (Beat This! + BTC CL): drop saved selections
 * that equal an old default, so the new defaults apply. Explicit non-default choices stay.
 */
function migrateSavedModelDefaults(): void {
  try {
    if (localStorage.getItem(DEFAULTS_VERSION_KEY) === DEFAULTS_VERSION) return;
    const beat = localStorage.getItem(BEAT_STORAGE_KEY);
    if (beat && PREVIOUS_DEFAULT_BEAT_MODELS.includes(beat)) localStorage.removeItem(BEAT_STORAGE_KEY);
    const chord = localStorage.getItem(CHORD_STORAGE_KEY);
    if (chord && PREVIOUS_DEFAULT_CHORD_MODELS.includes(chord)) localStorage.removeItem(CHORD_STORAGE_KEY);
    localStorage.setItem(DEFAULTS_VERSION_KEY, DEFAULTS_VERSION);
  } catch {
    // Storage unavailable (private mode): the in-memory defaults apply
  }
}

export interface ModelState {
  beatDetector: BeatDetectorType;
  chordDetector: ChordDetectorType;
  modelsInitialized: boolean;
  beatDetectorRef: React.MutableRefObject<BeatDetectorType>;
  chordDetectorRef: React.MutableRefObject<ChordDetectorType>;
  setBeatDetector: (detector: BeatDetectorType) => void;
  setChordDetector: (detector: ChordDetectorType) => void;
}

export interface UseModelStateOptions {
  initialBeatDetector?: BeatDetectorType | null;
  initialChordDetector?: ChordDetectorType | null;
}

/**
 * Custom hook for managing model selection state with localStorage persistence
 * Extracted from analyze page component - maintains ZERO logic changes
 */
export const useModelState = (options: UseModelStateOptions = {}): ModelState => {
  const { initialBeatDetector = null, initialChordDetector = null } = options;
  const previousInitialBeatDetectorRef = useRef<BeatDetectorType | null>(
    initialBeatDetector ? getSafeBeatModel(initialBeatDetector) : null,
  );
  const previousInitialChordDetectorRef = useRef<ChordDetectorType | null>(
    initialChordDetector ? getSafeChordModel(initialChordDetector) : null
  );

  // Initialize model states with localStorage persistence
  const [beatDetector, setBeatDetector] = useState<BeatDetectorType>(() => {
    if (initialBeatDetector) {
      return getSafeBeatModel(initialBeatDetector);
    }

    if (typeof window !== 'undefined') {
      migrateSavedModelDefaults();
      const saved = readStorage(BEAT_STORAGE_KEY);
      if (isBeatDetectorType(saved)) {
        return getSafeBeatModel(saved);
      }
    }
    return getDefaultBeatModel();
  });

  const [chordDetector, setChordDetector] = useState<ChordDetectorType>(() => {
    if (initialChordDetector) {
      return getSafeChordModel(initialChordDetector);
    }

    if (typeof window !== 'undefined') {
      migrateSavedModelDefaults();
      const saved = readStorage(CHORD_STORAGE_KEY);
      if (isChordDetectorType(saved)) {
        // Ensure the saved model is available in the current environment
        return getSafeChordModel(saved);
      }
    }
    return getDefaultChordModel();
  });

  const [modelsInitialized, setModelsInitialized] = useState<boolean>(false);

  // Use refs to ensure we always get the latest model values
  const beatDetectorRef = useRef(beatDetector);
  const chordDetectorRef = useRef(chordDetector);

  // Update refs when state changes
  useEffect(() => {
    beatDetectorRef.current = beatDetector;
  }, [beatDetector]);

  useEffect(() => {
    chordDetectorRef.current = chordDetector;
  }, [chordDetector]);

  useEffect(() => {
    if (initialBeatDetector && initialBeatDetector !== previousInitialBeatDetectorRef.current) {
      const safeModel = getSafeBeatModel(initialBeatDetector);
      previousInitialBeatDetectorRef.current = safeModel;
      const timer = window.setTimeout(() => {
        setBeatDetector(safeModel);
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [initialBeatDetector]);

  useEffect(() => {
    if (!initialChordDetector) {
      return;
    }

    const safeModel = getSafeChordModel(initialChordDetector);

    if (safeModel !== previousInitialChordDetectorRef.current) {
      previousInitialChordDetectorRef.current = safeModel;
      const timer = window.setTimeout(() => {
        setChordDetector(safeModel);
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [initialChordDetector]);

  // Persist beat detector selection to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(BEAT_STORAGE_KEY, beatDetector);
      } catch {
        // ignore storage errors
      }
    }
  }, [beatDetector]);

  // Persist chord detector selection to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CHORD_STORAGE_KEY, chordDetector);
      } catch {
        // ignore storage errors
      }
    }
  }, [chordDetector]);

  // Mark models as initialized after component mount to allow user interaction
  useEffect(() => {
    const timer = setTimeout(() => {
      setModelsInitialized(true);
    }, 100); // Minimal delay to prevent flash, allow immediate cache checking

    return () => clearTimeout(timer);
  }, []);

  return {
    beatDetector,
    chordDetector,
    modelsInitialized,
    beatDetectorRef,
    chordDetectorRef,
    setBeatDetector,
    setChordDetector,
  };
};
