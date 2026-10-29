'use client';

import { useEffect, useRef } from 'react';
import type { StemMixerEngine, StemTrackState } from '@/services/stems/stemMixerEngine';

export interface StemShortcutHandlers {
  engine: StemMixerEngine | null;
  tracks: StemTrackState[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onLoopPoint: (point: 'a' | 'b') => void;
}

export const STEM_SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['← →', 'Back / forward 5 s'],
  ['1–4', 'Select stem'],
  ['M / S', 'Mute / solo selected stem'],
  ['[ ]', 'Loop start / end at playhead'],
  ['L', 'Loop on / off'],
  ['Esc', 'Clear loop'],
  ['- =', 'Tempo −/+ 5%'],
  [', .', 'Pitch −/+ 1 semitone'],
];

const SEEK_STEP_SECONDS = 5;
const RATE_STEP = 0.05;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(target.type);
}

/** Global keyboard shortcuts for the stem player (ignored while typing in a field). */
export function useStemShortcuts(handlers: StemShortcutHandlers): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      const { engine, tracks, selectedIndex, onSelect, onLoopPoint } = latest.current;
      if (!engine) return;
      const selected = tracks[selectedIndex];
      const practice = engine.practiceState;
      let handled = true;

      switch (event.key) {
        case ' ':
          void Promise.resolve(engine.toggle()).catch(() => undefined);
          break;
        case 'ArrowLeft':
          engine.seek(engine.getCurrentTime() - SEEK_STEP_SECONDS);
          break;
        case 'ArrowRight':
          engine.seek(engine.getCurrentTime() + SEEK_STEP_SECONDS);
          break;
        case 'm':
        case 'M':
          if (selected) engine.setMuted(selected.name, !selected.muted);
          break;
        case 's':
        case 'S':
          if (selected) engine.setSoloed(selected.name, !selected.soloed);
          break;
        case '[':
          onLoopPoint('a');
          break;
        case ']':
          onLoopPoint('b');
          break;
        case 'l':
        case 'L':
          engine.setLoopEnabled(!practice.loopEnabled);
          break;
        case 'Escape':
          engine.setLoop(null);
          break;
        case '-':
          engine.setRate(practice.rate - RATE_STEP);
          break;
        case '=':
        case '+':
          engine.setRate(practice.rate + RATE_STEP);
          break;
        case ',':
          engine.setSemitones(practice.semitones - 1);
          break;
        case '.':
          engine.setSemitones(practice.semitones + 1);
          break;
        default:
          if (/^[1-9]$/.test(event.key) && Number(event.key) <= tracks.length) {
            onSelect(Number(event.key) - 1);
          } else {
            handled = false;
          }
      }

      if (handled) event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
