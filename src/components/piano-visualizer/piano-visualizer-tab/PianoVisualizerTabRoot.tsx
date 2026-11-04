'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollingChordStrip } from '@/components/piano-visualizer/ScrollingChordStrip';
import type { ActiveInstrument } from '@/components/piano-visualizer/FallingNotesCanvas';
import SheetMusicDisplay from '@/components/piano-visualizer/SheetMusicDisplay';
import { exportNoteTracksToMidi, downloadMidiFile } from '@/utils/midiExport';
import { useResolvedChordDisplayData } from '@/hooks/chord-analysis/useResolvedChordDisplayData';
import {
  useAnalysisResults,
  useChordCorrections,
  useEnabledInstrumentGroups,
  useKeySignature,
  useShowCorrectedChords,
} from '@/stores/analysisStore';
import { MELODY_PIPELINE_VERSION } from '@/types/sheetSage';
import {
  INSTRUMENT_GROUP_COLORS,
  INSTRUMENT_GROUP_LABELS,
  INSTRUMENT_GROUP_MIDI_PROGRAMS,
  INSTRUMENT_GROUP_ORDER,
} from '@/utils/instrumentGroups';
import {
  usePitchShiftSemitones,
  useRomanNumerals,
  useSimplifyChords,
} from '@/stores/uiStore';
import { HARMONY_TRANSCRIPTION_COLOR, MELODIC_TRANSCRIPTION_COLOR } from './constants';
import MelodyLayerToggles from './MelodyLayerToggles';
import { PianoRollPanel } from './PianoRollPanel';
import { useIsMobile } from '@/hooks/ui/useIsMobile';
import { PianoVisualizerHeader } from './PianoVisualizerHeader';
import { usePianoVisualizerTimelineModel } from './usePianoVisualizerTimelineModel';
import { useSheetMusicModel } from './useSheetMusicModel';
import type { PianoVisualizerTabProps, VisualizerDisplayMode } from './types';

export const PianoVisualizerTab: React.FC<PianoVisualizerTabProps> = ({
  analysisResults,
  chordGridData,
  className = '',
  keySignature,
  showCorrectedChords,
  chordCorrections,
  sequenceCorrections = null,
  currentTime = 0,
  isPlaying = false,
  audioUrl,
  sheetSageResult = null,
  showMelodicOverlay = false,
  gridLyrics = null,
}) => {
  const storeAnalysisResults = useAnalysisResults();
  const storeShowCorrectedChords = useShowCorrectedChords();
  const storeChordCorrections = useChordCorrections();
  const mergedAnalysisResults = analysisResults ?? storeAnalysisResults;
  const mergedShowCorrectedChords = showCorrectedChords ?? storeShowCorrectedChords;
  const mergedChordCorrections = chordCorrections ?? storeChordCorrections;
  const storeKeySignature = useKeySignature();
  const mergedKeySignature = keySignature ?? storeKeySignature;

  const pitchShiftSemitones = usePitchShiftSemitones();
  const simplePianoBlockChords = useSimplifyChords();
  const { showRomanNumerals, romanNumeralData } = useRomanNumerals() as {
    showRomanNumerals?: boolean;
    romanNumeralData?: { analysis?: string[] } | null;
  };

  const [speedIndex, setSpeedIndex] = useState(1);
  const [displayMode, setDisplayMode] = useState<VisualizerDisplayMode>('piano-roll');
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [noteColors, setNoteColors] = useState<Map<number, string>>(new Map());
  const activeNotesSignatureRef = useRef('');
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const isMobile = useIsMobile();

  const measureContainerWidth = useCallback((container: HTMLDivElement | null) => {
    if (!container) {
      return;
    }

    const width = container.getBoundingClientRect().width;
    setContainerWidth((prev) => (Math.abs(prev - width) >= 1 ? width : prev));
  }, []);

  const setMeasuredContainerRef = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;

    if (!node) {
      return;
    }

    measureContainerWidth(node);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth((prev) => (
          Math.abs(prev - entry.contentRect.width) >= 1 ? entry.contentRect.width : prev
        ));
      }
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, [measureContainerWidth]);

  useEffect(() => () => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
  }, []);

  const {
    resolvedChordGridData,
    displayedChords,
    isPitchShiftActive,
  } = useResolvedChordDisplayData({
    chordGridData,
    showCorrectedChords: mergedShowCorrectedChords,
    chordCorrections: mergedChordCorrections,
    sequenceCorrections,
  });

  const timelineModel = usePianoVisualizerTimelineModel({
    chordGridData,
    resolvedChordGridData,
    displayedChords,
    mergedKeySignature,
    sequenceCorrections,
    analysisResults: mergedAnalysisResults,
    audioUrl,
    sheetSageResult,
    showMelodicOverlay,
    pitchShiftSemitones,
    containerWidth,
    turnedRoll: isMobile,
    showRomanNumerals,
    romanNumeralData,
  });

  const sheetMusicModel = useSheetMusicModel({
    currentTime,
    displayMode,
    mergedKeySignature,
    sheetSageResult,
    isPitchShiftActive,
    pitchShiftSemitones,
    resolvedChordGridData,
    mergedPlayableChordEvents: timelineModel.mergedNotationChordEvents,
    stripChordEvents: timelineModel.stripChordEvents,
    notationBeatOffset: timelineModel.notationBeatOffset,
    beatToChordSequenceMap: timelineModel.beatToChordSequenceMap,
    shiftedOriginalChords: timelineModel.shiftedOriginalChords,
    sequenceCorrections,
    detectedBpm: timelineModel.detectedBpm,
    timeSignature: timelineModel.timeSignature,
    signalAnalysis: timelineModel.signalAnalysis,
    simplePianoBlockChords,
    includeMelodyInSheetMusic: showMelodicOverlay,
    gridLyrics,
  });

  const enabledInstrumentGroups = useEnabledInstrumentGroups();
  const isMelodyV2 = sheetSageResult?.pipelineVersion === MELODY_PIPELINE_VERSION;
  const visibleInstrumentGroups = useMemo(() => {
    const present = new Set((sheetSageResult?.instrumentNotes ?? []).map((note) => note.group));
    return INSTRUMENT_GROUP_ORDER.filter((group) => present.has(group) && enabledInstrumentGroups.includes(group));
  }, [enabledInstrumentGroups, sheetSageResult?.instrumentNotes]);

  // Only model output is drawn in the piano roll; chord-symbol voicings are no longer rendered here.
  const legendInstruments = useMemo<ActiveInstrument[]>(() => {
    if (!showMelodicOverlay || timelineModel.melodyOverlayNotes.length === 0) return [];
    const layers: ActiveInstrument[] = [{ name: isMelodyV2 ? 'Vocal' : 'Melody Lead', color: MELODIC_TRANSCRIPTION_COLOR }];
    if (timelineModel.melodyOverlayNotes.some((n) => n.color === HARMONY_TRANSCRIPTION_COLOR)) {
      layers.push({ name: 'Harmony', color: HARMONY_TRANSCRIPTION_COLOR });
    }
    for (const group of visibleInstrumentGroups) {
      layers.push({ name: INSTRUMENT_GROUP_LABELS[group], color: INSTRUMENT_GROUP_COLORS[group] });
    }
    return layers;
  }, [isMelodyV2, showMelodicOverlay, timelineModel.melodyOverlayNotes, visibleInstrumentGroups]);

  const handleActiveNotesChange = useCallback((notes: Set<number>, colors: Map<number, string>) => {
    const signature = Array.from(notes)
      .sort((a, b) => a - b)
      .map((note) => `${note}:${colors.get(note) ?? ''}`)
      .join('|');

    if (signature === activeNotesSignatureRef.current) {
      return;
    }

    activeNotesSignatureRef.current = signature;
    setActiveNotes(notes);
    setNoteColors(colors);
  }, []);

  const midiTracks = useMemo(() => {
    if (!showMelodicOverlay || !sheetSageResult) return [];
    return [
      { name: isMelodyV2 ? 'Vocal' : 'Melody', noteEvents: sheetSageResult.noteEvents ?? [] },
      ...visibleInstrumentGroups.map((group) => ({
        name: INSTRUMENT_GROUP_LABELS[group],
        noteEvents: (sheetSageResult.instrumentNotes ?? []).filter((note) => note.group === group),
        program: INSTRUMENT_GROUP_MIDI_PROGRAMS[group],
      })),
    ].filter((track) => track.noteEvents.length > 0);
  }, [isMelodyV2, sheetSageResult, showMelodicOverlay, visibleInstrumentGroups]);

  const handleMidiDownload = useCallback(() => {
    const midiData = exportNoteTracksToMidi(midiTracks, {
      bpm: timelineModel.detectedBpm || undefined,
      timeSignature: timelineModel.timeSignature,
    });
    if (midiData.length > 0) {
      downloadMidiFile(midiData, 'piano-visualizer.mid');
    }
  }, [midiTracks, timelineModel.detectedBpm, timelineModel.timeSignature]);

  if (!mergedAnalysisResults) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-white p-8 shadow-card dark:bg-content-bg ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">Run chord analysis to see piano visualization.</p>
      </div>
    );
  }

  const lookAheadSeconds = speedIndex >= 0 && speedIndex < 3
    ? [6, 4, 2][speedIndex]
    : 4;

  return (
    <div className={`piano-visualizer-tab space-y-3 ${className}`}>
      <PianoVisualizerHeader
        midiTrackCount={midiTracks.length}
        onMidiDownload={handleMidiDownload}
        effectiveDisplayMode={sheetMusicModel.effectiveDisplayMode}
        hasSheetMusicData={sheetMusicModel.hasSheetMusicData}
        sheetMusicDisabledTooltip={sheetMusicModel.sheetMusicDisabledTooltip}
        onDisplayModeChange={setDisplayMode}
        speedIndex={speedIndex}
        onSpeedChange={setSpeedIndex}
      />

      {showMelodicOverlay && sheetSageResult?.instrumentNotes?.length ? (
        <MelodyLayerToggles instrumentNotes={sheetSageResult.instrumentNotes} />
      ) : null}

      <ScrollingChordStrip
        chordEvents={timelineModel.stripChordEvents}
        currentTime={currentTime}
        isPlaying={isPlaying}
        height={56}
        pixelsPerSecond={118}
        timeSignature={timelineModel.timeSignature}
        accidentalPreference={timelineModel.accidentalPreference}
        beatRomanNumerals={timelineModel.beatRomanNumerals}
        beatModulations={timelineModel.beatModulations}
        uncorrectedChords={resolvedChordGridData?.chords}
        gridLyrics={gridLyrics}
      />

      {sheetMusicModel.effectiveDisplayMode === 'sheet-music' ? (
        <SheetMusicDisplay
          className="w-full"
          musicXml={sheetMusicModel.sheetMusicXml}
          currentTime={sheetMusicModel.sheetMusicCurrentTime}
          totalDuration={timelineModel.totalDuration}
          bpm={timelineModel.detectedBpm || 120}
          timeSignature={timelineModel.timeSignature}
          isComputing={sheetMusicModel.isSheetMusicComputing}
        />
      ) : (
        <PianoRollPanel
          legendInstruments={legendInstruments}
          setMeasuredContainerRef={setMeasuredContainerRef}
          keyboardWidth={timelineModel.keyboardWidth}
          containerWidth={containerWidth}
          turned={isMobile}
          currentTime={currentTime}
          isPlaying={isPlaying}
          melodyOverlayNotes={timelineModel.melodyOverlayNotes}
          pianoRange={timelineModel.pianoRange}
          beatLines={timelineModel.beatLines}
          handleActiveNotesChange={handleActiveNotesChange}
          activeNotes={activeNotes}
          noteColors={noteColors}
          whiteKeyWidth={timelineModel.whiteKeyWidth}
          lookAheadSeconds={lookAheadSeconds}
        />
      )}
    </div>
  );
};

export default PianoVisualizerTab;
