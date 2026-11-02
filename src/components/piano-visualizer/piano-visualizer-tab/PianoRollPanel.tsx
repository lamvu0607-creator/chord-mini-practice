'use client';

import React from 'react';
import { FallingNotesCanvas, type ActiveInstrument, type ExtraVisualNote } from '@/components/piano-visualizer/FallingNotesCanvas';
import { PianoKeyboard } from '@/components/piano-visualizer/PianoKeyboard';
import {
  useAnalysisStore,
  useFocusedMelodyLayer,
  usePianoRollHeight,
  usePianoRollRangeMode,
  type PianoRollHeight,
  type PianoRollRangeMode,
} from '@/stores/analysisStore';
import type { ChordEvent } from '@/utils/chordToMidi';
import type { BeatLine, PianoRange } from './pianoRollLayout';

interface PianoRollPanelProps {
  legendInstruments: ActiveInstrument[];
  setMeasuredContainerRef: (node: HTMLDivElement | null) => void;
  keyboardWidth: number;
  currentTime: number;
  isPlaying: boolean;
  melodyOverlayNotes: ExtraVisualNote[];
  pianoRange: PianoRange;
  beatLines: BeatLine[];
  handleActiveNotesChange: (notes: Set<number>, colors: Map<number, string>) => void;
  activeNotes: Set<number>;
  noteColors: Map<number, string>;
  whiteKeyWidth: number;
  lookAheadSeconds: number;
}

const NO_CHORD_EVENTS: ChordEvent[] = [];
const RANGE_OPTIONS: Array<{ value: PianoRollRangeMode; label: string; title: string }> = [
  { value: 'fit', label: 'Fit', title: 'Show only the octaves this song uses' },
  { value: 'full', label: '88 keys', title: 'Show the full keyboard' },
];
const HEIGHT_OPTIONS: Array<{ value: PianoRollHeight; label: string; title: string }> = [
  { value: 280, label: 'S', title: 'Small piano roll' },
  { value: 420, label: 'M', title: 'Medium piano roll' },
  { value: 600, label: 'L', title: 'Large piano roll' },
];

function SegmentedControl<T extends string | number>({ label, options, value, onChange }: {
  label: string;
  options: Array<{ value: T; label: string; title: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded border border-gray-700">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`px-2 py-0.5 text-xs font-medium transition-colors ${
            option.value === value ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Piano roll of model-transcribed notes only (vocal line + MuScriptor instrument layers). */
export const PianoRollPanel: React.FC<PianoRollPanelProps> = ({
  legendInstruments,
  setMeasuredContainerRef,
  keyboardWidth,
  currentTime,
  isPlaying,
  melodyOverlayNotes,
  pianoRange,
  beatLines,
  handleActiveNotesChange,
  activeNotes,
  noteColors,
  whiteKeyWidth,
  lookAheadSeconds,
}) => {
  const focusedLayer = useFocusedMelodyLayer();
  const rangeMode = usePianoRollRangeMode();
  const rollHeight = usePianoRollHeight();
  const setRangeMode = useAnalysisStore((state) => state.setPianoRollRangeMode);
  const setRollHeight = useAnalysisStore((state) => state.setPianoRollHeight);

  return (
    <div
      ref={setMeasuredContainerRef}
      className="piano-visualizer-section rounded-lg overflow-hidden bg-gray-950 dark:bg-gray-950"
    >
      {legendInstruments.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-800 bg-gray-900/60 px-3 py-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
            Layers:
          </span>
          {legendInstruments.map((inst) => (
            <div key={inst.name} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: inst.color }}
              />
              <span className="text-xs font-medium text-gray-400">{inst.name}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <SegmentedControl label="Keyboard range" options={RANGE_OPTIONS} value={rangeMode} onChange={setRangeMode} />
            <SegmentedControl label="Piano roll height" options={HEIGHT_OPTIONS} value={rollHeight} onChange={setRollHeight} />
          </div>
        </div>
      )}

      <div className="relative overflow-x-auto overflow-y-hidden">
        <div className="mx-auto flex flex-col items-center" style={{ minWidth: keyboardWidth }}>
          <div className="relative flex w-full justify-center">
            {melodyOverlayNotes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
                <p className="max-w-sm text-sm text-gray-400">
                  No model notes yet. Click 𝄞 (melody transcription) to transcribe vocals and instruments.
                </p>
              </div>
            )}
            <FallingNotesCanvas
              chordEvents={NO_CHORD_EVENTS}
              currentTime={currentTime}
              isPlaying={isPlaying}
              startMidi={pianoRange.startMidi}
              endMidi={pianoRange.endMidi}
              whiteKeyWidth={whiteKeyWidth}
              lookAheadSeconds={lookAheadSeconds}
              lookBehindSeconds={0.5}
              height={rollHeight}
              playbackTime={currentTime}
              extraVisualNotes={melodyOverlayNotes}
              readabilityMode
              beatLines={beatLines}
              focusedLayer={focusedLayer}
              onActiveNotesChange={handleActiveNotesChange}
            />
          </div>

          <div className="flex w-full justify-center bg-gradient-to-b from-gray-950 to-gray-900 pb-2">
            <PianoKeyboard
              startMidi={pianoRange.startMidi}
              endMidi={pianoRange.endMidi}
              activeNotes={activeNotes}
              noteColors={noteColors}
              whiteKeyWidth={whiteKeyWidth}
              height={60}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
