import 'server-only';
import { claimNextMelodyJob, pruneOldMelodyJobs, retryOrFailMelodyJob } from '@/server/melody/melodyJobService';
import { MELODY_LEASE_MS, processMelodyJob } from '@/server/melody/melodyPipeline';
import { claimNextStemJob, pruneOldStemJobs, retryOrFailStemJob } from '@/server/stems/stemJobService';
import { processStemJob, STEM_LEASE_MS } from '@/server/stems/stemJobProcessor';

const globalWorker = globalThis as typeof globalThis & { __gpuWorkerStarted?: boolean; __gpuWorkerBusy?: boolean };
const pollMs = Math.max(250, Number(process.env.STEMS_WORKER_POLL_MS || 2000));

/**
 * One GPU job at a time: an 8 GB card cannot hold SCNet and MuScriptor working together.
 * Stem jobs go first, because queued melody jobs usually wait on a separation.
 */
export async function runGpuWorkerTick(): Promise<'stem' | 'melody' | null> {
  if (globalWorker.__gpuWorkerBusy) return null;
  globalWorker.__gpuWorkerBusy = true;
  try {
    const stemJob = claimNextStemJob(STEM_LEASE_MS);
    if (stemJob) {
      try {
        await processStemJob(stemJob);
      } catch (error) {
        retryOrFailStemJob(stemJob, error instanceof Error ? error.message : String(error));
      }
      return 'stem';
    }
    const melodyJob = claimNextMelodyJob(MELODY_LEASE_MS);
    if (melodyJob) {
      try {
        await processMelodyJob(melodyJob);
      } catch (error) {
        retryOrFailMelodyJob(melodyJob, error instanceof Error ? error.message : String(error));
      }
      return 'melody';
    }
    return null;
  } finally {
    globalWorker.__gpuWorkerBusy = false;
  }
}

export function startGpuWorker(): void {
  if (globalWorker.__gpuWorkerStarted) return;
  globalWorker.__gpuWorkerStarted = true;
  pruneOldStemJobs();
  pruneOldMelodyJobs();
  void runGpuWorkerTick();
  const timer = setInterval(() => void runGpuWorkerTick(), pollMs);
  timer.unref?.();
}
