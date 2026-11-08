'use client';

import React from 'react';
import { MdForward5, MdReplay5 } from 'react-icons/md';
import { clampSeek, SEEK_STEP_SECONDS } from '@/utils/seekBy';

interface SeekStepButtonProps {
  direction: 'back' | 'forward';
  currentTime: number;
  /**
   * Live position read at click time. The `currentTime` prop can lag (it is not
   * refreshed while paused), so repeated clicks would otherwise not add up.
   */
  getCurrentTime?: () => number | null | undefined;
  duration: number;
  onSeek?: (time: number) => void;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
}

/** Rewind / fast-forward by 5 seconds. */
export default function SeekStepButton({
  direction,
  currentTime,
  getCurrentTime,
  duration,
  onSeek,
  disabled,
  className = '',
  iconClassName = 'h-5 w-5',
}: SeekStepButtonProps) {
  const isBack = direction === 'back';
  const Icon = isBack ? MdReplay5 : MdForward5;
  return (
    <button
      type="button"
      aria-label={isBack ? `Rewind ${SEEK_STEP_SECONDS} seconds` : `Forward ${SEEK_STEP_SECONDS} seconds`}
      title={isBack ? `Rewind ${SEEK_STEP_SECONDS}s (←)` : `Forward ${SEEK_STEP_SECONDS}s (→)`}
      disabled={disabled || !onSeek}
      onClick={() => {
        const live = getCurrentTime?.();
        const from = typeof live === 'number' && Number.isFinite(live) ? live : currentTime;
        onSeek?.(clampSeek(from, isBack ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS, duration));
      }}
      className={`flex items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <Icon className={iconClassName} aria-hidden />
    </button>
  );
}
