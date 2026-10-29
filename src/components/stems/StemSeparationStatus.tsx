'use client';

import React from 'react';
import { Button, Progress } from '@heroui/react';
import type { SeparationState } from '@/hooks/stems/useStemSeparation';

interface StemSeparationStatusProps {
  state: SeparationState;
  onDismiss: () => void;
}

function describe(state: SeparationState): string {
  switch (state.phase) {
    case 'preparing': return 'Fetching the song audio…';
    case 'uploading': return `Uploading… ${Math.round((state.progress ?? 0) * 100)}%`;
    case 'queued': return state.queuePosition ? `Waiting in queue (${state.queuePosition} ahead)…` : 'Starting separation…';
    case 'processing': return state.progress !== undefined
      ? `Separating with SCNet… ${Math.round(state.progress * 100)}%`
      : 'Separating with SCNet…';
    default: return '';
  }
}

const StemSeparationStatus: React.FC<StemSeparationStatusProps> = ({ state, onDismiss }) => {
  if (state.phase === 'idle' || state.phase === 'done') return null;

  if (state.phase === 'error') {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        <span>{state.error}</span>
        <Button size="sm" variant="light" color="danger" onPress={onDismiss}>Dismiss</Button>
      </div>
    );
  }

  const determinate = state.phase === 'uploading' || (state.phase === 'processing' && state.progress !== undefined);
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
      {state.title && <p className="mb-1 truncate text-sm font-semibold text-gray-900 dark:text-white">{state.title}</p>}
      <p className="mb-3 text-sm text-gray-700 dark:text-gray-200">{describe(state)}</p>
      <Progress
        aria-label="Separation progress"
        size="sm"
        isIndeterminate={!determinate}
        value={determinate ? (state.progress ?? 0) * 100 : undefined}
        color="primary"
      />
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        A 4-minute song takes about a minute. You can leave this page; the result will be in your library.
      </p>
    </div>
  );
};

export default StemSeparationStatus;
