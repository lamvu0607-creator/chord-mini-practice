import 'server-only';
import { getMuscriptorApiUrl, getSheetSageApiUrl } from '@/config/serverBackend';
import { setDocument } from '@/server/persistence/documentService';
import { createStemJob, findActiveStemJob, getStemJob } from '@/server/stems/stemJobService';
import { getStemSet, touchStemSet, upsertPendingStemSet } from '@/server/stems/stemSetRepository';
import { relativeStemDir } from '@/server/stems/stemStorage';
import type { SheetSageResult } from '@/types/sheetSage';
import {
  completeMelodyJob,
  deferMelodyJobForStems,
  retryOrFailMelodyJob,
  updateMelodyJobProgress,
  updateMelodyJobStage,
  type MelodyJobRecord,
} from './melodyJobService';
import { buildMelodyV2Result, normalizeMelodyResultForCache } from './melodyResult';

const SHEETSAGE_TIMEOUT_MS = Math.max(60_000, Number(process.env.SHEETSAGE_BACKEND_TIMEOUT_MS || 600_000));
const MUSCRIPTOR_TIMEOUT_MS = Math.max(60_000, Number(process.env.MUSCRIPTOR_BACKEND_TIMEOUT_MS || 1_800_000));
const PROGRESS_POLL_MS = 2_000;
export const MELODY_LEASE_MS = SHEETSAGE_TIMEOUT_MS + MUSCRIPTOR_TIMEOUT_MS + 60_000;

export function muscriptorBackendUrl(): string {
  return getMuscriptorApiUrl().replace(/\/$/, '');
}

class BackendError extends Error {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
  }
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number, service: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new BackendError(`${service} unreachable: ${error instanceof Error ? error.message : String(error)}`, false);
  }
  const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: T };
  if (!response.ok || !payload.success || !payload.data) {
    // 400: bad/missing input audio, 503: missing model weights. Retrying will not help either.
    throw new BackendError(payload.error || `${service} failed (${response.status})`,
      response.status === 400 || response.status === 503);
  }
  return payload.data;
}

/**
 * Returns true when the job may continue to transcription. Otherwise it queues (or waits for) the
 * separation of this song, or fails the job when that separation failed.
 */
function ensureStems(job: MelodyJobRecord): boolean {
  const stemSet = getStemSet(job.sourceId);
  if (stemSet?.status === 'ready' && stemSet.stems.some((stem) => stem.name === 'vocals')) {
    touchStemSet(job.sourceId);
    return true;
  }
  const watched = job.stemJobId ? getStemJob(job.stemJobId) : null;
  if (watched?.status === 'failed') {
    retryOrFailMelodyJob(job, `Stem separation failed: ${watched.error || 'unknown error'}`, 0, true);
    return false;
  }
  let active = findActiveStemJob(job.sourceId);
  if (!active) {
    if (!stemSet) {
      upsertPendingStemSet({ sourceId: job.sourceId, sourceType: 'youtube', videoId: job.videoId, inputPath: job.inputPath });
    }
    active = createStemJob({ sourceId: job.sourceId, inputPath: stemSet?.inputPath ?? job.inputPath, requestedBy: job.requestedBy });
  }
  deferMelodyJobForStems(job, active.jobId);
  return false;
}

async function transcribeInstruments(job: MelodyJobRecord) {
  updateMelodyJobStage(job.jobId, 'instruments', 0);
  const timer = setInterval(() => {
    void fetch(`${muscriptorBackendUrl()}/progress/${encodeURIComponent(job.jobId)}`, { signal: AbortSignal.timeout(5_000) })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { progress?: number } | null) => {
        if (typeof payload?.progress === 'number') updateMelodyJobProgress(job.jobId, payload.progress);
      })
      .catch(() => undefined);
  }, PROGRESS_POLL_MS);
  timer.unref?.();
  try {
    return await postJson<{ model: string; notes: Array<{ onset: number; offset: number; pitch: number; instrument: string }> }>(
      `${muscriptorBackendUrl()}/transcribe`, { jobId: job.jobId, inputPath: job.inputPath }, MUSCRIPTOR_TIMEOUT_MS, 'MuScriptor');
  } finally {
    clearInterval(timer);
  }
}

/** Stems (if needed) → vocal line from the vocals stem → instrument notes from the mix → cache. */
export async function processMelodyJob(job: MelodyJobRecord): Promise<void> {
  if (!ensureStems(job)) return;
  const started = Date.now();
  try {
    updateMelodyJobStage(job.jobId, 'vocal');
    const vocal = await postJson<SheetSageResult>(
      `${getSheetSageApiUrl().replace(/\/$/, '')}/transcribe`,
      { inputPath: `${relativeStemDir(job.sourceId)}/vocals.flac`, mixPath: job.inputPath },
      SHEETSAGE_TIMEOUT_MS,
      'Sheet Sage',
    );
    const instruments = await transcribeInstruments(job);
    const result = buildMelodyV2Result({ vocal, instruments, processingTime: (Date.now() - started) / 1000 });
    await setDocument('melody', job.videoId, normalizeMelodyResultForCache(job.videoId, result));
    completeMelodyJob(job.jobId);
  } catch (error) {
    const permanent = error instanceof BackendError && error.permanent;
    retryOrFailMelodyJob(job, error instanceof Error ? error.message : String(error), 2, permanent);
  }
}
