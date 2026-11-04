'use client';

import React from 'react';
import { Button, Slider, Tooltip } from '@heroui/react';
import { HiArrowPath } from 'react-icons/hi2';
import { MAX_SEMITONES, type PracticeState, type StemMixerEngine } from '@/services/stems/stemMixerEngine';
import { formatTime } from './stemColors';

interface StemPracticeBarProps {
  engine: StemMixerEngine;
  practice: PracticeState;
  /** Start point picked with "A" while no loop exists yet. */
  pendingLoopStart: number | null;
  onSetLoopPoint: (point: 'a' | 'b') => void;
}

const smallButton = 'h-11 min-w-11 px-3 text-sm md:h-7 md:min-w-0 md:px-2 md:text-xs';
const resetButton = 'flex h-11 w-11 items-center justify-center text-gray-500 hover:text-blue-600 md:h-auto md:w-auto';
/** Practice range; the engine itself also accepts 0.25x..2x to follow YouTube rates. */
const PRACTICE_MIN_RATE = 0.5;
const PRACTICE_MAX_RATE = 1.5;

const StemPracticeBar: React.FC<StemPracticeBarProps> = ({ engine, practice, pendingLoopStart, onSetLoopPoint }) => {
  const { rate, semitones, loop, loopEnabled } = practice;
  const semitoneLabel = semitones > 0 ? `+${semitones}` : String(semitones);

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-divider bg-content1/90 p-3 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] md:grid-cols-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-600 dark:text-gray-300">Tempo</span>
          <span className="flex items-center gap-1">
            <span className="font-mono tabular-nums text-gray-800 dark:text-gray-100">{Math.round(rate * 100)}%</span>
            {rate !== 1 && (
              <Tooltip content="Reset tempo" delay={400}>
                <button type="button" aria-label="Reset tempo" className={resetButton} onClick={() => engine.setRate(1)}>
                  <HiArrowPath className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
          </span>
        </div>
        <Slider
          aria-label="Tempo"
          size="sm"
          minValue={PRACTICE_MIN_RATE}
          maxValue={PRACTICE_MAX_RATE}
          step={0.05}
          value={rate}
          onChange={(value) => engine.setRate(Array.isArray(value) ? value[0] : value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-600 dark:text-gray-300">Pitch</span>
          <span className="flex items-center gap-1">
            <Button size="sm" variant="flat" className={smallButton} aria-label="Pitch down a semitone" onPress={() => engine.setSemitones(semitones - 1)}>−</Button>
            <span className="w-8 text-center font-mono tabular-nums text-gray-800 dark:text-gray-100">{semitoneLabel}</span>
            <Button size="sm" variant="flat" className={smallButton} aria-label="Pitch up a semitone" onPress={() => engine.setSemitones(semitones + 1)}>+</Button>
            {semitones !== 0 && (
              <Tooltip content="Reset pitch" delay={400}>
                <button type="button" aria-label="Reset pitch" className={resetButton} onClick={() => engine.setSemitones(0)}>
                  <HiArrowPath className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
          </span>
        </div>
        <Slider
          aria-label="Pitch in semitones"
          size="sm"
          minValue={-MAX_SEMITONES}
          maxValue={MAX_SEMITONES}
          step={1}
          value={semitones}
          onChange={(value) => engine.setSemitones(Array.isArray(value) ? value[0] : value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-600 dark:text-gray-300">Loop A–B</span>
          <span className="font-mono tabular-nums text-gray-800 dark:text-gray-100">
            {loop
              ? `${formatTime(loop.start)} – ${formatTime(loop.end)}`
              : pendingLoopStart !== null ? `${formatTime(pendingLoopStart)} – …` : 'Drag across a waveform'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Tooltip content="Set loop start at the playhead ( [ )" delay={400}>
            <Button size="sm" variant="flat" className={smallButton} onPress={() => onSetLoopPoint('a')}>A</Button>
          </Tooltip>
          <Tooltip content="Set loop end at the playhead ( ] )" delay={400}>
            <Button size="sm" variant="flat" className={smallButton} onPress={() => onSetLoopPoint('b')}>B</Button>
          </Tooltip>
          <Tooltip content="Toggle loop (L)" delay={400}>
            <Button
              size="sm"
              color={loopEnabled ? 'primary' : 'default'}
              variant={loopEnabled ? 'solid' : 'flat'}
              className={smallButton}
              isDisabled={!loop}
              onPress={() => engine.setLoopEnabled(!loopEnabled)}
            >
              {loopEnabled ? 'Loop on' : 'Loop off'}
            </Button>
          </Tooltip>
          {loop && (
            <Button size="sm" variant="light" className={smallButton} onPress={() => engine.setLoop(null)}>Clear</Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StemPracticeBar;
