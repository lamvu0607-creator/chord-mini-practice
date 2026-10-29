import 'server-only';
import { BACKEND_URLS } from '@/config/api';
import {
  claimNextStemJob,
  completeStemJob,
  pruneOldStemJobs,
  retryOrFailStemJob,
  type StemJobRecord,
} from './stemJobService';
import {
  deleteStemSetRow,
  getStemStorageUsageBytes,
  listEvictableStemSets,
  markStemSetReady,
} from './stemSetRepository';
import { isValidStemName, relativeStemDir, removeStemDir } from './stemStorage';

const globalWorker = globalThis as typeof globalThis & { __stemWorkerStarted?: boolean; __stemWorkerBusy?: boolean };
const pollMs = Math.max(250, Number(process.env.STEMS_WORKER_POLL_MS || 2000));
const timeoutMs = Math.max(60_000, Number(process.env.STEMS_BACKEND_TIMEOUT_MS || 1_800_000));
const leaseMs = timeoutMs + 60_000;

interface SeparateResponse {
  success?: boolean;
  error?: string;
  data?: {
    model: string;
    duration?: number;
    stems: Array<{ name: string; file: string; bytes: number }>;
  };
}

export function stemsBackendUrl(): string {
  return BACKEND_URLS.STEMS_BACKEND.replace(/\/$/, '');
}

/** Evict least recently used stem sets until usage fits STEMS_QUOTA_GB. */
export async function enforceStemQuota(keepSourceId?: string): Promise<number> {
  const quotaGb = Number(process.env.STEMS_QUOTA_GB || 10);
  if (!Number.isFinite(quotaGb) || quotaGb <= 0) return 0;
  const quotaBytes = quotaGb * 1024 ** 3;

  let usage = getStemStorageUsageBytes();
  let evicted = 0;
  for (const record of listEvictableStemSets()) {
    if (usage <= quotaBytes) break;
    if (record.sourceId === keepSourceId) continue;
    await removeStemDir(record.sourceId);
    deleteStemSetRow(record.sourceId);
    usage -= record.totalBytes;
    evicted += 1;
  }
  return evicted;
}

async function processJob(job: StemJobRecord): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${stemsBackendUrl()}/separate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.jobId, inputPath: job.inputPath, outputDir: relativeStemDir(job.sourceId) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    retryOrFailStemJob(job, `Stems service unreachable: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const payload = (await response.json().catch(() => ({}))) as SeparateResponse;
  if (!response.ok || !payload.success || !payload.data) {
    const message = payload.error || `Stems service failed (${response.status})`;
    // 400: bad/missing input audio, 503: missing model weights. Retrying will not help either.
    const permanent = response.status === 400 || response.status === 503;
    const friendly = message.includes('inputPath does not exist')
      ? 'The source audio is no longer cached. Load the song again and retry.'
      : message;
    retryOrFailStemJob(job, friendly, 2, permanent);
    return;
  }

  const stems = payload.data.stems.filter((stem) => isValidStemName(stem.name));
  markStemSetReady(job.sourceId, {
    model: payload.data.model,
    stems,
    durationMs: payload.data.duration !== undefined ? Math.round(payload.data.duration * 1000) : undefined,
  });
  completeStemJob(job.jobId);
  await enforceStemQuota(job.sourceId).catch((error) => console.warn('Stem quota enforcement failed:', error));
}

async function tick(): Promise<void> {
  // The GPU service separates one song at a time, so the worker never runs jobs in parallel.
  if (globalWorker.__stemWorkerBusy) return;
  const job = claimNextStemJob(leaseMs);
  if (!job) return;
  globalWorker.__stemWorkerBusy = true;
  try {
    await processJob(job);
  } catch (error) {
    retryOrFailStemJob(job, error instanceof Error ? error.message : String(error));
  } finally {
    globalWorker.__stemWorkerBusy = false;
  }
}

export function startStemWorker(): void {
  if (globalWorker.__stemWorkerStarted) return;
  globalWorker.__stemWorkerStarted = true;
  pruneOldStemJobs();
  void tick();
  const timer = setInterval(() => void tick(), pollMs);
  timer.unref?.();
}
