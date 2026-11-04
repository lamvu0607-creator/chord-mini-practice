'use client';

import React from 'react';
import { MdForward5, MdReplay5 } from 'react-icons/md';
import { clampSeek, SEEK_STEP_SECONDS } from '@/utils/seekBy';

interface SeekStepButtonProps {
  direction: 'back' | 'forward';
  currentTime: number;
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
      onClick={() => onSeek?.(clampSeek(currentTime, isBack ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS, duration))}
      className={`flex items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <Icon className={iconClassName} aria-hidden />
    </button>
  );
}
