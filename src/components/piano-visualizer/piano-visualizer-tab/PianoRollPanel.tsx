'use client';

import React from 'react';
import { FallingNotesCanvas, type ActiveInstrument } from '@/components/piano-visualizer/FallingNotesCanvas';
import { PianoKeyboard } from '@/components/piano-visualizer/PianoKeyboard';
import type { ChordEvent } from '@/utils/chordToMidi';
import { PIANO_END_MIDI, PIANO_START_MIDI } from './constants';

interface PianoRollPanelProps {
  legendInstruments: ActiveInstrument[];
  setMeasuredContainerRef: (node: HTMLDivElement | null) => void;
  keyboardWidth: number;
  currentTime: number;
  isPlaying: boolean;
  melodyOverlayNotes: Array<{ midi: number; startTime: number; endTime: number; color: string }>;
  handleActiveNotesChange: (notes: Set<number>, colors: Map<number, string>) => void;
  activeNotes: Set<number>;
  noteColors: Map<number, string>;
  whiteKeyWidth: number;
  lookAheadSeconds: number;
}

const NO_CHORD_EVENTS: ChordEvent[] = [];

/** Piano roll of model-transcribed notes only (vocal line + MuScriptor instrument layers). */
export const PianoRollPanel: React.FC<PianoRollPanelProps> = ({
  legendInstruments,
  setMeasuredContainerRef,
  keyboardWidth,
  currentTime,
  isPlaying,
  melodyOverlayNotes,
  handleActiveNotesChange,
  activeNotes,
  noteColors,
  whiteKeyWidth,
  lookAheadSeconds,
}) => {
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
              startMidi={PIANO_START_MIDI}
              endMidi={PIANO_END_MIDI}
              whiteKeyWidth={whiteKeyWidth}
              lookAheadSeconds={lookAheadSeconds}
              lookBehindSeconds={0.5}
              height={280}
              playbackTime={currentTime}
              extraVisualNotes={melodyOverlayNotes}
              onActiveNotesChange={handleActiveNotesChange}
            />
          </div>

          <div className="flex w-full justify-center bg-gradient-to-b from-gray-950 to-gray-900 pb-2">
            <PianoKeyboard
              startMidi={PIANO_START_MIDI}
              endMidi={PIANO_END_MIDI}
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
