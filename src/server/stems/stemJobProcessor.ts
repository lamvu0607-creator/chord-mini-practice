import 'server-only';
import { BACKEND_URLS } from '@/config/api';
import { completeStemJob, retryOrFailStemJob, type StemJobRecord } from './stemJobService';
import {
  deleteStemSetRow,
  getStemStorageUsageBytes,
  listEvictableStemSets,
  markStemSetReady,
} from './stemSetRepository';
import { isValidStemName, relativeStemDir, removeStemDir } from './stemStorage';

export const STEMS_TIMEOUT_MS = Math.max(60_000, Number(process.env.STEMS_BACKEND_TIMEOUT_MS || 1_800_000));
export const STEM_LEASE_MS = STEMS_TIMEOUT_MS + 60_000;

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

export async function processStemJob(job: StemJobRecord): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${stemsBackendUrl()}/separate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.jobId, inputPath: job.inputPath, outputDir: relativeStemDir(job.sourceId) }),
      signal: AbortSignal.timeout(STEMS_TIMEOUT_MS),
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
