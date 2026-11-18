'use client';

import { Spinner } from '@heroui/react';

interface ExtractionWaitPanelProps {
  queueStatus?: 'queued' | 'active' | 'released' | 'cancelled' | 'expired' | null;
  queuePosition?: number | null;
  estimatedWaitSeconds?: number | null;
  statusMessage?: string;
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s`;
  return `~${Math.round(seconds / 60)} min`;
}

export default function ExtractionWaitPanel({
  queueStatus,
  queuePosition,
  estimatedWaitSeconds,
  statusMessage,
}: ExtractionWaitPanelProps) {
  const isQueued = queueStatus === 'queued';
  const title = isQueued ? 'Waiting in queue' : 'Analyzing audio';

  const details: string[] = [];
  if (isQueued && typeof queuePosition === 'number' && queuePosition > 0) {
    details.push(`Position ${queuePosition}`);
  }
  if (typeof estimatedWaitSeconds === 'number' && estimatedWaitSeconds > 0) {
    details.push(`Estimated wait ${formatWait(estimatedWaitSeconds)}`);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 rounded-xl border border-default-200 dark:border-gray-800 bg-default-50/60 dark:bg-gray-900/20 p-6 text-center"
    >
      <Spinner size="md" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {statusMessage && (
        <p className="text-sm text-default-500 dark:text-gray-400">{statusMessage}</p>
      )}
      {details.length > 0 && (
        <p className="text-xs text-default-500 dark:text-gray-400">{details.join(' · ')}</p>
      )}
      <p className="text-xs text-default-400 dark:text-gray-500">
        Results will appear here when the analysis finishes.
      </p>
    </div>
  );
}
