'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { chordMappingService } from '@/services/chord-analysis/chordMappingService';
import { GuitarChordTimeline } from '@/components/chord-analysis/GuitarChordTimeline';
import { GuitarNowNextPanel } from '@/components/chord-analysis/GuitarNowNextPanel';
import type { BeatGridTimedLyrics } from '@/components/chord-analysis/GridLyricsRow';
import { useAnalysisResults, useShowCorrectedChords, useChordCorrections, useKeySignature, useIsDetectingKey } from '@/stores/analysisStore';
import { useCurrentBeatIndex, useCurrentTime, useIsPlaying } from '@/stores/playbackStore';
import {
  useGuitarCapoFret,
  useGuitarSelectedPositions,
  useSetGuitarCapoFret,
  useSetGuitarSelectedPosition,
  useIsPitchShiftEnabled,
  useSimplifyChords,
  useTargetKey,
  useUIStore,
} from '@/stores/uiStore';
import { transposeChord, calculateTargetKey } from '@/utils/chordTransposition';
import {
  DEFAULT_MAX_CAPO_SUGGESTION_FRET,
  suggestCapoPosition,
  type GuitarVoicingSelection,
} from '@/utils/guitarVoicing';
import { buildChordTimeline, type ChordEvent } from '@/utils/chordToMidi';
import { useResolvedChordDisplayData } from '@/hooks/chord-analysis/useResolvedChordDisplayData';
import { useSharedAudioDynamics } from '@/hooks/audio/useSharedAudioDynamics';
import { useGuitarOnlyPlayback } from '@/hooks/chord-playback/useGuitarOnlyPlayback';
import { useViewportSnapshot } from '@/hooks/ui/useViewportSnapshot';
import CapoNeckPreview from '@/components/chord-analysis/CapoNeckPreview';
import AppTooltip from '@/components/common/AppTooltip';
import { FiChevronDown, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { safeLocalStorage } from '@/utils/browserStorage';
import GuitarTablature from '@/components/chord-analysis/GuitarTablature';


// Lazy load heavy guitar chord diagram component
const GuitarChordDiagram = dynamic(() => import('@/components/chord-playback/GuitarChordDiagram'), {
  loading: () => <div className="w-20 h-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-lg" />,
  ssr: false
});

interface ChordData {
  key: string;
  suffix:string;
  positions: Array<{
    frets: number[];
    fingers: number[];
    baseFret: number;
    barres: number[];
    capo?: boolean;
    midi?: number[];
  }>;
}

interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount?: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

interface GuitarChordsTabProps {
  analysisResults?: AnalysisResult | null;
  chordGridData: ChordGridData;
  className?: string;
  keySignature?: string | null;
  isDetectingKey?: boolean;
  isChatbotOpen?: boolean;
  isLyricsPanelOpen?: boolean;
  isUploadPage?: boolean;
  showCorrectedChords?: boolean;
  chordCorrections?: Record<string, string> | null;
  sequenceCorrections?: {
    originalSequence: string[];
    correctedSequence: string[];
    keyAnalysis?: {
      sections: Array<{
        startIndex: number;
        endIndex: number;
        key: string;
        chords: string[];
      }>;
      modulations?: Array<{
        fromKey: string;
        toKey: string;
        atIndex: number;
        atTime?: number;
      }>;
    };
  } | null;
  isChordPlaybackEnabled?: boolean;
  audioUrl?: string | null;
  gridLyrics?: BeatGridTimedLyrics | null;
  plainLyrics?: string | null;
}

const GUITAR_SOUND_STORAGE_KEY = 'guitarTab.guitarSound';

function GuitarPlaybackBridge({
  playbackChordEvents,
  isChordPlaybackEnabled,
  detectedBpm,
  timeSignature,
  dynamicsAnalyzer,
  guitarVoicing,
  targetKey,
}: {
  playbackChordEvents: ChordEvent[];
  isChordPlaybackEnabled: boolean;
  detectedBpm?: number;
  timeSignature: number;
  dynamicsAnalyzer: ReturnType<typeof useSharedAudioDynamics>;
  guitarVoicing: Partial<GuitarVoicingSelection>;
  targetKey?: string | null;
}) {
  const currentBeatIndex = useCurrentBeatIndex();
  const currentTime = useCurrentTime();
  const isPlaying = useIsPlaying();

  useGuitarOnlyPlayback(
    playbackChordEvents,
    currentTime,
    currentBeatIndex,
    isPlaying,
    isChordPlaybackEnabled,
    detectedBpm || 120,
    timeSignature,
    dynamicsAnalyzer,
    guitarVoicing,
    targetKey,
  );

  return null;
}

function GuitarTablaturePlaybackView({
  playbackChordEvents,
  detectedBpm,
  timeSignature,
  guitarVoicing,
  targetKey,
  dynamicsAnalyzer,
  gridLyrics,
}: {
  playbackChordEvents: ChordEvent[];
  detectedBpm?: number;
  timeSignature: number;
  guitarVoicing: Partial<GuitarVoicingSelection>;
  targetKey?: string | null;
  dynamicsAnalyzer: ReturnType<typeof useSharedAudioDynamics>;
  gridLyrics?: BeatGridTimedLyrics | null;
}) {
  const currentTime = useCurrentTime();
  const isPlaying = useIsPlaying();

  return (
    <GuitarTablature
      chordEvents={playbackChordEvents}
      currentTime={currentTime}
      isPlaying={isPlaying}
      bpm={detectedBpm || 120}
      pixelsPerSecond={118}
      timeSignature={timeSignature}
      guitarVoicing={guitarVoicing}
      targetKey={targetKey ?? undefined}
      dynamicsAnalyzer={dynamicsAnalyzer}
      gridLyrics={gridLyrics}
    />
  );
}

export const GuitarChordsTab: React.FC<GuitarChordsTabProps> = ({
  analysisResults,
  chordGridData,
  className = '',
  keySignature,
  isDetectingKey,
  showCorrectedChords,
  chordCorrections,
  sequenceCorrections = null,
  isChordPlaybackEnabled = false,
  audioUrl = null,
  gridLyrics = null,
}) => {
  const targetKey = useTargetKey();
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const storeKeySignature = useKeySignature();
  const storeIsDetectingKey = useIsDetectingKey();

  const [viewMode, setViewMode] = useState<'animated' | 'summary' | 'tab'>('animated');
  // Strum-along guitar is opt-in; the choice is remembered per browser.
  const [isGuitarSoundOn, setIsGuitarSoundOn] = useState(() => {
    try {
      return safeLocalStorage().getItem(GUITAR_SOUND_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [chordDataCache, setChordDataCache] = useState<Map<string, ChordData | null>>(new Map());
  const [isLoadingChords, setIsLoadingChords] = useState<boolean>(false);

  // Shared guitar voicing state
  const capoFret = useGuitarCapoFret();
  const chordPositions = useGuitarSelectedPositions();
  const setSharedCapoFret = useSetGuitarCapoFret();
  const setSharedChordPosition = useSetGuitarSelectedPosition();
  // Basic / Advanced chords: the same global switch as the Simplify button in the utility bar
  const simplifyChords = useSimplifyChords();
  const setSimplifyChords = useUIStore((state) => state.setSimplifyChords);
  const [isCapoPreviewOpen, setIsCapoPreviewOpen] = useState(false);
  const [isCompactControlsOpen, setIsCompactControlsOpen] = useState(false);
  const hasUserAdjustedCapoRef = useRef(false);
  const capoSuggestionSignatureRef = useRef('');
  const capoPreviewCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { width: windowWidth } = useViewportSnapshot();

  // Wrapped setter that clears chord data cache when capo changes (new chord shapes need to be loaded)
  const setCapoFret = useCallback((value: number | ((prev: number) => number), options?: { isUserInitiated?: boolean }) => {
    const nextValue = typeof value === 'function' ? value(capoFret) : value;
    if (!Number.isFinite(nextValue)) {
      return;
    }
    if (options?.isUserInitiated !== false) {
      hasUserAdjustedCapoRef.current = true;
    }
    setSharedCapoFret(nextValue);
    setChordDataCache(new Map());
  }, [capoFret, setSharedCapoFret]);

  // When capo is set, transpose chords DOWN by capo fret count to get the "shape" chord
  // e.g., capo on fret 2: song has D → guitarist plays C shape (D transposed -2 = C)
  const capoTargetKey = useMemo(() => {
    if (capoFret === 0) return 'C';
    const baseKey = targetKey || keySignature || 'C';
    return calculateTargetKey(baseKey, -capoFret);
  }, [capoFret, keySignature, targetKey]);

  const isCompactHeader = windowWidth < 640;
  const nowDiagramWidth = windowWidth >= 1024 ? 160 : windowWidth >= 640 ? 140 : 128;

  // Handle chord position changes
  const handlePositionChange = useCallback((chordName: string, positionIndex: number) => {
    setSharedChordPosition(chordName, positionIndex);
  }, [setSharedChordPosition]);

  // Pull analysis toggles and data from Zustand stores when not provided via props

  const storeAnalysisResults = useAnalysisResults();
  const storeShowCorrectedChords = useShowCorrectedChords();
  const storeChordCorrections = useChordCorrections();

  const mergedAnalysisResults = analysisResults ?? storeAnalysisResults;
  const mergedShowCorrectedChords = showCorrectedChords ?? storeShowCorrectedChords;
  const mergedChordCorrections = chordCorrections ?? storeChordCorrections;
  const {
    resolvedChordGridData,
    displayedChords,
  } = useResolvedChordDisplayData({
    chordGridData,
    showCorrectedChords: mergedShowCorrectedChords,
    chordCorrections: mergedChordCorrections,
    sequenceCorrections,
  });

  // Build chord timeline for guitar-only playback (uses resolved grid to reflect pitch shifts/corrections)
  const playbackChordEvents = useMemo<ChordEvent[]>(() => {
    if (!resolvedChordGridData) return [];
    return buildChordTimeline(
      resolvedChordGridData.chords,
      resolvedChordGridData.beats,
      resolvedChordGridData.paddingCount,
      resolvedChordGridData.shiftCount,
    );
  }, [resolvedChordGridData]);

  const timeSignature = mergedAnalysisResults?.beatDetectionResult?.time_signature || 4;
  const detectedBpm = mergedAnalysisResults?.beatDetectionResult?.bpm;
  const playbackTotalDuration = useMemo(
    () => (playbackChordEvents.length > 0
      ? playbackChordEvents[playbackChordEvents.length - 1].endTime
      : undefined),
    [playbackChordEvents],
  );
  const dynamicsParams = useMemo(
    () => ({
      bpm: detectedBpm || 120,
      timeSignature,
      totalDuration: playbackTotalDuration,
    }),
    [detectedBpm, timeSignature, playbackTotalDuration],
  );
  const dynamicsAnalyzer = useSharedAudioDynamics(audioUrl, dynamicsParams);

  const guitarVoicing = useMemo<Partial<GuitarVoicingSelection>>(
    () => ({
      capoFret,
      selectedPositions: chordPositions,
    }),
    [capoFret, chordPositions],
  );

  const normalizeChordNameForDisplay = useCallback((originalChord: string): string => {
    if (!originalChord ||
        originalChord === '' ||
        originalChord === 'N.C.' ||
        originalChord === 'N' ||
        originalChord === 'N/C' ||
        originalChord === 'NC') {
      return 'N.C.';
    }
    return originalChord;
  }, []);

  // This matches the beat-grid display: corrections/enharmonic updates first, capo transposition later.
  const getProcessedSoundingChordName = useCallback((originalChord: string): string => {
    const normalizedChord = normalizeChordNameForDisplay(originalChord);
    if (normalizedChord === 'N.C.') return normalizedChord;

    return normalizedChord;
  }, [normalizeChordNameForDisplay]);

  const getProcessedShapeChordName = useCallback((soundingChord: string): string => {
    const normalizedChord = normalizeChordNameForDisplay(soundingChord);
    if (normalizedChord === 'N.C.') {
      return normalizedChord;
    }

    const rawShapeChord = capoFret > 0
      ? transposeChord(normalizedChord, -capoFret, capoTargetKey)
      : normalizedChord;

    return chordMappingService.getPreferredDiagramChordName(rawShapeChord);
  }, [normalizeChordNameForDisplay, capoFret, capoTargetKey]);

  // Build capo label mappings for both occurrence-specific animated diagrams and
  // unique summary diagrams. Shape names can collapse multiple sounding slash
  // chords into the same renderable diagram, so animated playback needs an
  // index-based lookup instead of a shape-name-only map.
  const processedChordData = useMemo(() => {
    const entries = displayedChords.map((chord) => {
      const sounding = getProcessedSoundingChordName(chord);
      const shape = getProcessedShapeChordName(sounding);
      return { sounding, shape };
    });

    const soundingNameByIndex = new Map<number, string>();
    const soundingNamesByShape = new Map<string, string[]>();

    entries.forEach(({ sounding, shape }, index) => {
      if (shape !== 'N.C.' && sounding !== 'N.C.' && shape !== sounding) {
        soundingNameByIndex.set(index, sounding);

        const currentShapeLabels = soundingNamesByShape.get(shape) || [];
        if (!currentShapeLabels.includes(sounding)) {
          soundingNamesByShape.set(shape, [...currentShapeLabels, sounding]);
        }
      }
    });

    return {
      entries,
      soundingNameByIndex,
      soundingNameByShape: new Map(
        Array.from(soundingNamesByShape.entries()).map(([shape, soundingNames]) => [
          shape,
          soundingNames.join(' | '),
        ])
      ),
    };
  }, [displayedChords, getProcessedSoundingChordName, getProcessedShapeChordName]);

  const capoSuggestionTargetKey = useMemo(() => (
    targetKey || keySignature || 'C'
  ), [keySignature, targetKey]);

  const uniqueSoundingChordsForCapoSuggestion = useMemo(() => (
    Array.from(
      new Set(
        processedChordData.entries
          .map((entry) => entry.sounding)
          .filter((chord) => chord && chord !== 'N.C.')
      )
    )
  ), [processedChordData.entries]);

  const capoSuggestionSignature = useMemo(() => (
    uniqueSoundingChordsForCapoSuggestion.join('||')
  ), [uniqueSoundingChordsForCapoSuggestion]);

  const suggestedCapo = useMemo(() => (
    suggestCapoPosition(uniqueSoundingChordsForCapoSuggestion, {
      maxCapo: DEFAULT_MAX_CAPO_SUGGESTION_FRET,
      targetKey: capoSuggestionTargetKey,
    })
  ), [uniqueSoundingChordsForCapoSuggestion, capoSuggestionTargetKey]);

  const openCapoPreview = useCallback(() => {
    if (capoPreviewCloseTimeoutRef.current) {
      clearTimeout(capoPreviewCloseTimeoutRef.current);
      capoPreviewCloseTimeoutRef.current = null;
    }
    setIsCapoPreviewOpen(true);
  }, []);

  const scheduleCapoPreviewClose = useCallback(() => {
    if (capoPreviewCloseTimeoutRef.current) {
      clearTimeout(capoPreviewCloseTimeoutRef.current);
    }
    capoPreviewCloseTimeoutRef.current = setTimeout(() => {
      setIsCapoPreviewOpen(false);
      capoPreviewCloseTimeoutRef.current = null;
    }, 120);
  }, []);

  const handleCapoPreviewBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget as Node | null;
    if (nextFocusedElement && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }
    scheduleCapoPreviewClose();
  }, [scheduleCapoPreviewClose]);

  useEffect(() => (
    () => {
      if (capoPreviewCloseTimeoutRef.current) {
        clearTimeout(capoPreviewCloseTimeoutRef.current);
      }
    }
  ), []);

  useEffect(() => {
    if (capoSuggestionSignatureRef.current === capoSuggestionSignature) {
      return;
    }

    capoSuggestionSignatureRef.current = capoSuggestionSignature;
    hasUserAdjustedCapoRef.current = false;
  }, [capoSuggestionSignature]);

  useEffect(() => {
    if (!suggestedCapo || hasUserAdjustedCapoRef.current) {
      return;
    }

    if (capoFret !== suggestedCapo.capoFret) {
      useUIStore.getState().setGuitarCapoFret(suggestedCapo.capoFret);
    }
  }, [suggestedCapo, capoFret]);


  // Unique chords for guitar diagrams (always applies corrections for consistent display)
  const uniqueChordsForGuitarDiagrams = useMemo(() => {
    const chordSet = new Set<string>();
    if (resolvedChordGridData?.originalAudioMapping?.length) {
      resolvedChordGridData.originalAudioMapping.forEach(mapping => {
        const processedChord = processedChordData.entries[mapping.visualIndex]?.shape;
        if (processedChord) chordSet.add(processedChord);
      });
    } else {
      const skipCount = (resolvedChordGridData?.paddingCount || 0) + (resolvedChordGridData?.shiftCount || 0);
      processedChordData.entries.slice(skipCount).forEach((entry) => {
        if (entry.shape) chordSet.add(entry.shape);
      });
    }
    return Array.from(chordSet).sort();
  }, [resolvedChordGridData, processedChordData.entries]);

  useEffect(() => {
    const loadChordData = async () => {
      const chordsToLoad = new Set<string>();
      uniqueChordsForGuitarDiagrams.forEach(chord => {
        if (!chordDataCache.has(chord)) chordsToLoad.add(chord);
      });
      if (chordsToLoad.size > 0) {
        setIsLoadingChords(true);
        try {
          const results = await Promise.all(
            Array.from(chordsToLoad).map(async (chord) => ({ chord, data: await chordMappingService.getChordData(chord) }))
          );
          setChordDataCache(cache => {
            const updatedCache = new Map(cache);
            results.forEach(({ chord, data }) => updatedCache.set(chord, data));
            return updatedCache;
          });
        } catch (error) { console.error('Failed to load chord data:', error); }
        setIsLoadingChords(false);
      }
    };
    loadChordData();
  }, [uniqueChordsForGuitarDiagrams, chordDataCache]);

  // Unfiltered chord data for guitar diagrams (always shows all chords with consistent corrections)
  const uniqueChordDataForGuitarDiagrams = useMemo(() => {
    const seenChords = new Set<string>();
    return uniqueChordsForGuitarDiagrams
      .filter(chord => !seenChords.has(chord) && seenChords.add(chord))
      .map(chord => ({ name: chord, data: chordDataCache.get(chord) || null }));
  }, [uniqueChordsForGuitarDiagrams, chordDataCache]);



  // Unfiltered chord progression for guitar diagrams (always shows all chords regardless of Roman numeral toggle)
  const getUniqueChordProgressionForGuitarDiagrams = useMemo(() => {
    if (!processedChordData.entries.length) return [];
    const uniqueProgression = [];
    let lastChord = null;
    const skipCount = (resolvedChordGridData?.paddingCount || 0) + (resolvedChordGridData?.shiftCount || 0);
    for (let i = 0; i < processedChordData.entries.length; i++) {
      const shapeChord = processedChordData.entries[i]?.shape || 'N.C.';
      const isShiftCell = i < (resolvedChordGridData?.shiftCount || 0) && !shapeChord;
      const isPaddingCell = i >= (resolvedChordGridData?.shiftCount || 0)
        && i < skipCount
        && shapeChord === 'N.C.'
        && Boolean(resolvedChordGridData?.hasPadding);
      if (isShiftCell || isPaddingCell) continue;
      if (shapeChord) {
        if (shapeChord !== lastChord) {
          uniqueProgression.push({ chord: shapeChord, startIndex: i, timestamp: resolvedChordGridData?.beats[i] || 0 });
          lastChord = shapeChord;
        }
      }
    }
    return uniqueProgression;
  }, [processedChordData.entries, resolvedChordGridData]);

  // Timeline labels use the same shape names as the diagrams, so they always match.
  const timelineChords = useMemo(
    () => processedChordData.entries.map((entry) => (entry.shape === 'N.C.' ? '' : entry.shape)),
    [processedChordData.entries],
  );

  const getSoundingNameForProgressionItem = useCallback(
    (item: { chord: string; startIndex: number }) => (
      processedChordData.soundingNameByIndex.get(item.startIndex)
      || processedChordData.soundingNameByShape.get(item.chord)
    ),
    [processedChordData],
  );

  if (!mergedAnalysisResults) {
    return (
      <div className={`flex items-center justify-center p-8 bg-white dark:bg-content-bg rounded-lg shadow-card ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">Run chord analysis to see guitar chord diagrams.</p>
      </div>
    );
  }

  const toggleGuitarSound = () => {
    setIsGuitarSoundOn((on) => {
      const next = !on;
      try { safeLocalStorage().setItem(GUITAR_SOUND_STORAGE_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
  };

  // Song facts shown beside the timeline title (same tags as the chord grid header).
  const headerKeySignature = (keySignature !== undefined ? keySignature : storeKeySignature) || undefined;
  const headerIsDetectingKey = isDetectingKey ?? storeIsDetectingKey;
  let displayKey = headerKeySignature;
  if (isPitchShiftEnabled && targetKey && headerKeySignature) {
    const quality = headerKeySignature.match(/s+(major|minor)$/i)?.[1];
    displayKey = quality ? `${targetKey} ${quality}` : targetKey;
  }
  const headerTagClassName = 'rounded-lg border px-2 py-0.5 text-xs font-medium sm:px-3 sm:py-1 sm:text-sm';

  const segmentedControlClassName = 'flex space-x-1 rounded-full bg-white/75 p-1 shadow-sm backdrop-blur dark:bg-gray-800/50';
  const activeSegmentClassName = 'bg-slate-900 text-white shadow-sm dark:bg-gray-900';
  const inactiveSegmentClassName = 'text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10';
  const capoControlClassName = 'flex items-center rounded-full bg-white/75 shadow-sm backdrop-blur dark:bg-gray-800/50';
  const segmentButtonClassName = 'min-h-11 rounded-md px-2.5 py-1 text-xs font-medium transition-colors md:min-h-0 sm:px-3 sm:py-1.5 sm:text-sm';
  const timeSignatureLabel = timeSignature === 6 ? '6/8' : `${timeSignature}/4`;
  const formattedDisplayKey = displayKey ? displayKey.replace(/b/g, '♭').replace(/#/g, '♯') : null;

  const chordDetailControl = (
    <div className="flex items-center gap-1.5">
      <span className="whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm">Chords:</span>
      <div className={segmentedControlClassName} role="group" aria-label="Chord detail">
        <AppTooltip content="Major and minor chords only">
          <button
            type="button"
            aria-pressed={simplifyChords}
            onClick={() => setSimplifyChords(true)}
            className={`${segmentButtonClassName} ${simplifyChords ? activeSegmentClassName : inactiveSegmentClassName}`}
          >
            Basic
          </button>
        </AppTooltip>
        <AppTooltip content="Every chord as detected, with 7ths and extensions">
          <button
            type="button"
            aria-pressed={!simplifyChords}
            onClick={() => setSimplifyChords(false)}
            className={`${segmentButtonClassName} ${!simplifyChords ? activeSegmentClassName : inactiveSegmentClassName}`}
          >
            Advanced
          </button>
        </AppTooltip>
      </div>
    </div>
  );

  const capoControl = (
    <div
      className="relative flex items-center gap-2"
      onMouseEnter={openCapoPreview}
      onMouseLeave={scheduleCapoPreviewClose}
      onFocus={openCapoPreview}
      onBlur={handleCapoPreviewBlur}
    >
      <div className="flex items-center gap-1.5">
        <label htmlFor="capo-input" className="whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm">
          Capo:
        </label>
        <div className={capoControlClassName}>
          <button
            onClick={() => setCapoFret(prev => Math.max(0, prev - 1))}
            disabled={capoFret === 0}
            className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold md:h-8 md:w-7 text-gray-600 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
            aria-label="Decrease capo fret"
          >
            −
          </button>
          <input
            id="capo-input"
            type="number"
            min={0}
            max={12}
            value={capoFret}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 0 && val <= 12) setCapoFret(val);
            }}
            className="w-8 h-11 md:h-8 text-center text-sm font-medium bg-transparent border-0 focus:outline-none focus:ring-0 text-gray-800 dark:text-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="Capo fret position"
          />
          <button
            onClick={() => setCapoFret(prev => Math.min(12, prev + 1))}
            disabled={capoFret === 12}
            className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold md:h-8 md:w-7 text-gray-600 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
            aria-label="Increase capo fret"
          >
            +
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isCapoPreviewOpen && (
          <>
            <div
              aria-hidden="true"
              className={`absolute top-full z-30 h-3 w-[min(22rem,calc(100vw-2rem))] ${isCompactHeader ? 'right-0' : 'left-0 sm:left-auto sm:right-0'}`}
            />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`absolute top-[calc(100%+0.25rem)] z-40 w-[min(22rem,calc(100vw-2rem))] ${isCompactHeader ? 'right-0' : 'left-0 sm:left-auto sm:right-0'}`}
              onMouseEnter={openCapoPreview}
              onMouseLeave={scheduleCapoPreviewClose}
            >
              <CapoNeckPreview
                capoFret={capoFret}
                suggestedCapoFret={suggestedCapo?.capoFret ?? null}
                onCapoFretChange={(fret) => setCapoFret(fret)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );

  const guitarSoundButton = (
    <AppTooltip content={isChordPlaybackEnabled
      ? 'Chord playback is on, so the instrument mixer plays the chords'
      : isGuitarSoundOn ? 'Mute the guitar that strums along' : 'Strum the chords on guitar during playback'}
    >
      <button
        type="button"
        aria-pressed={isGuitarSoundOn}
        aria-label="Guitar sound"
        onClick={toggleGuitarSound}
        className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-sm transition-colors md:min-h-0 sm:py-1.5 sm:text-sm ${isGuitarSoundOn ? activeSegmentClassName : `bg-white/75 backdrop-blur dark:bg-gray-800/50 ${inactiveSegmentClassName}`}`}
      >
        {isGuitarSoundOn ? <FiVolume2 aria-hidden="true" className="h-4 w-4" /> : <FiVolumeX aria-hidden="true" className="h-4 w-4" />}
        Guitar
      </button>
    </AppTooltip>
  );

  const viewModeControl = (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm">View:</span>
      <div className={segmentedControlClassName}>
        <button onClick={() => setViewMode('animated')} className={`${segmentButtonClassName} ${viewMode === 'animated' ? activeSegmentClassName : inactiveSegmentClassName}`}>Animated</button>
        <button onClick={() => setViewMode('summary')} className={`${segmentButtonClassName} ${viewMode === 'summary' ? activeSegmentClassName : inactiveSegmentClassName}`}>Summary</button>
        <button onClick={() => setViewMode('tab')} className={`${segmentButtonClassName} ${viewMode === 'tab' ? activeSegmentClassName : inactiveSegmentClassName}`}>Tab</button>
      </div>
    </div>
  );

  // Phone: one summary row (song facts + capo), the other controls fold away below it.
  const compactSongFacts = [
    headerIsDetectingKey ? 'Detecting key...' : formattedDisplayKey,
    timeSignatureLabel,
    detectedBpm ? `${Math.round(detectedBpm)} BPM` : null,
  ].filter(Boolean).join(' · ');

  const compactHeader = (
    <div className="rounded-xl bg-white/75 shadow-sm backdrop-blur dark:bg-gray-800/50">
      <div className="flex items-center gap-1 pl-3 pr-1">
        <button
          type="button"
          aria-expanded={isCompactControlsOpen}
          aria-controls="guitar-tab-options"
          onClick={() => setIsCompactControlsOpen((open) => !open)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-gray-700 dark:text-gray-300"
        >
          <span className="truncate">{compactSongFacts}</span>
          <FiChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 transition-transform ${isCompactControlsOpen ? 'rotate-180' : ''}`}
          />
          <span className="sr-only">{isCompactControlsOpen ? 'Hide display options' : 'Show display options'}</span>
        </button>
        {capoControl}
      </div>
      {isCompactControlsOpen && (
        <div
          id="guitar-tab-options"
          className="flex flex-wrap items-center gap-2 border-t border-gray-200/70 px-2 py-2 dark:border-gray-700/70"
        >
          {chordDetailControl}
          {guitarSoundButton}
          {viewModeControl}
        </div>
      )}
    </div>
  );

  return (
    <div className={`guitar-chords-tab space-y-2 sm:space-y-3 ${className}`}>
      {isGuitarSoundOn && (
      <GuitarPlaybackBridge
        playbackChordEvents={playbackChordEvents}
        isChordPlaybackEnabled={isChordPlaybackEnabled}
        detectedBpm={detectedBpm}
        timeSignature={timeSignature}
        dynamicsAnalyzer={dynamicsAnalyzer}
        guitarVoicing={guitarVoicing}
        targetKey={targetKey}
      />
      )}

      {/* Chord Timeline Section */}
      <div className="chord-grid-section space-y-2">
        {isCompactHeader ? compactHeader : (
        <div className="mb-2 flex flex-row items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <h3 className="mr-1 text-base font-medium text-gray-700 dark:text-gray-300 sm:text-lg">Chord Timeline</h3>
            <span className={`${headerTagClassName} border-blue-300/60 bg-blue-500/10 text-blue-800 dark:border-blue-400/35 dark:bg-blue-800/40 dark:text-blue-50`}>
              Time: {timeSignatureLabel}
            </span>
            {detectedBpm ? (
              <span className={`${headerTagClassName} border-amber-300/60 bg-amber-500/10 text-amber-800 dark:border-amber-400/35 dark:bg-amber-800/40 dark:text-amber-50`}>
                Tempo: {Math.round(detectedBpm)} BPM
              </span>
            ) : null}
            {formattedDisplayKey && (
              <span className={`${headerTagClassName} border-green-300/60 bg-green-500/10 text-green-800 dark:border-green-400/35 dark:bg-green-800/40 dark:text-green-50`}>
                Key: {formattedDisplayKey}
              </span>
            )}
            {headerIsDetectingKey && (
              <span className={`${headerTagClassName} border-blue-300/55 bg-blue-500/12 text-blue-800 dark:border-blue-300/35 dark:bg-blue-300/16 dark:text-white`}>
                Detecting key...
              </span>
            )}
          </div>
          <div className="flex w-auto flex-wrap items-center gap-3">
            {chordDetailControl}
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            {capoControl}
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            {guitarSoundButton}
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            {viewModeControl}
          </div>
        </div>
        )}
        {viewMode !== 'tab' && (
          <GuitarChordTimeline
            chords={timelineChords}
            beatTimes={resolvedChordGridData?.beats ?? []}
            timeSignature={timeSignature}
            gridLyrics={gridLyrics}
          />
        )}
      </div>

      {/* Guitar Chord Diagrams / Tablature Section */}
      <div className="chord-diagrams-section relative">
        {isLoadingChords && viewMode === 'animated' && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">Loading Diagrams...</span>
          </div>
        )}

        {viewMode === 'tab' ? (
          <GuitarTablaturePlaybackView
            playbackChordEvents={playbackChordEvents}
            detectedBpm={detectedBpm}
            timeSignature={timeSignature}
            guitarVoicing={guitarVoicing}
            targetKey={targetKey}
            dynamicsAnalyzer={dynamicsAnalyzer}
            gridLyrics={gridLyrics}
          />
        ) : !isLoadingChords && viewMode === 'animated' ? (
          <GuitarNowNextPanel
            progression={getUniqueChordProgressionForGuitarDiagrams}
            chordDataCache={chordDataCache}
            chordPositions={chordPositions}
            getSoundingName={getSoundingNameForProgressionItem}
            onPositionChange={handlePositionChange}
            capoFret={capoFret}
            diagramWidth={nowDiagramWidth}
          />
        ) : !isLoadingChords && (
          <div className="summary-chord-view relative p-4 sm:p-6">
            <h3 className="mb-4 text-center text-base font-medium text-gray-700 dark:text-gray-300 sm:mb-6 sm:text-lg">All Chords in Song ({uniqueChordsForGuitarDiagrams.length} unique)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4 md:gap-6 justify-items-center">
              {uniqueChordDataForGuitarDiagrams.map(({name, data}, index) => (
                <div key={index} className="flex justify-center">
                  <GuitarChordDiagram
                    chordData={data}
                    positionIndex={chordPositions[name] || 0}
                    size="medium"
                    showChordName={true}
                    className="hover:scale-105 transition-transform"
                    displayName={name}
                    soundingChordName={processedChordData.soundingNameByShape.get(name)}
                    isFocused={false}
                    showPositionSelector={true}
                    onPositionChange={(positionIndex) => handlePositionChange(name, positionIndex)}
                    capoFret={capoFret}
                    capoLabelMode="shape"
                    showRomanNumerals={false}
                    romanNumeral=""
                  />
                </div>
              ))}
            </div>
            {uniqueChordsForGuitarDiagrams.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-12 max-w-md mx-auto">
                <Image src="/quarter_rest.svg" alt="No chords" width={64} height={64} className="mx-auto mb-4 opacity-50" style={{ filter: 'brightness(0.4)' }} />
                <p className="text-lg font-medium">No chords detected in this song</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuitarChordsTab;
