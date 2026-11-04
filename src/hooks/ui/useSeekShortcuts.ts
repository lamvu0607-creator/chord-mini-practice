'use client';

import { useEffect, useRef } from 'react';
import { clampSeek, SEEK_STEP_SECONDS } from '@/utils/seekBy';

export interface SeekShortcutOptions {
  /** Performs the actual seek (should be the same handler the scrubber uses). */
  onSeek: (time: number) => void;
  /** Read at key-press time so the hook never works with a stale position. */
  getCurrentTime: () => number;
  getDuration: () => number;
  enabled?: boolean;
  step?: number;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(target.type);
}

/**
 * ArrowLeft / ArrowRight seek back / forward by `step` seconds (default 5).
 * Ignored while typing in a field or when a modifier key is held.
 */
export function useSeekShortcuts(options: SeekShortcutOptions): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      // Let sliders keep their own arrow-key behaviour.
      if (event.target instanceof HTMLElement && event.target.getAttribute('role') === 'slider') return;

      const { onSeek, getCurrentTime, getDuration, step = SEEK_STEP_SECONDS } = latest.current;
      const delta = event.key === 'ArrowLeft' ? -step : step;
      event.preventDefault();
      onSeek(clampSeek(getCurrentTime(), delta, getDuration()));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
