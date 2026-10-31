import 'server-only';
import crypto from 'crypto';
import { getDatabase } from '@/server/persistence/database';
import type { MelodyJob, MelodyJobStage, MelodyJobStatus } from '@/types/sheetSage';

export interface MelodyJobRecord extends MelodyJob {
  sourceId: string;
  requestedBy?: string;
  /** Mix audio, relative to the audio root (MuScriptor input; protected from eviction while active). */
  inputPath: string;
  stemJobId?: string;
  attemptCount: number;
  nextAttemptAtMs: number;
  leaseExpiresAtMs?: number;
  completedAtMs?: number;
}

type JobRow = {
  job_id: string; video_id: string; source_id: string; status: MelodyJobStatus; stage: MelodyJobStage;
  requested_by: string | null; input_path: string; stem_job_id: string | null; progress: number | null;
  error: string | null; attempt_count: number; next_attempt_at_ms: number; lease_expires_at_ms: number | null;
  created_at_ms: number; updated_at_ms: number; completed_at_ms: number | null;
};

function mapRow(row: JobRow): MelodyJobRecord {
  return {
    jobId: row.job_id, videoId: row.video_id, sourceId: row.source_id, status: row.status, stage: row.stage,
    requestedBy: row.requested_by ?? undefined, inputPath: row.input_path, stemJobId: row.stem_job_id ?? undefined,
    progress: row.progress, error: row.error, attemptCount: row.attempt_count, nextAttemptAtMs: row.next_attempt_at_ms,
    leaseExpiresAtMs: row.lease_expires_at_ms ?? undefined, createdAtMs: row.created_at_ms, updatedAtMs: row.updated_at_ms,
    completedAtMs: row.completed_at_ms ?? undefined,
  };
}

export function toPublicMelodyJob(job: MelodyJobRecord): MelodyJob {
  return {
    jobId: job.jobId, videoId: job.videoId, status: job.status, stage: job.stage, progress: job.progress,
    error: job.error, createdAtMs: job.createdAtMs, updatedAtMs: job.updatedAtMs,
  };
}

export function createMelodyJob(input: {
  videoId: string; sourceId: string; inputPath: string; requestedBy?: string;
}): MelodyJobRecord {
  const now = Date.now();
  const jobId = `melody_${now}_${crypto.randomUUID()}`;
  getDatabase().sqlite.prepare(`INSERT INTO melody_jobs(job_id,video_id,source_id,status,stage,requested_by,input_path,
      attempt_count,next_attempt_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,'queued','queued',?,?,0,?,?,?)`)
    .run(jobId, input.videoId, input.sourceId, input.requestedBy ?? null, input.inputPath, now, now, now);
  return getMelodyJob(jobId)!;
}

export function getMelodyJob(jobId: string): MelodyJobRecord | null {
  const row = getDatabase().sqlite.prepare('SELECT * FROM melody_jobs WHERE job_id=?').get(jobId) as JobRow | undefined;
  return row ? mapRow(row) : null;
}

export function findActiveMelodyJob(videoId: string): MelodyJobRecord | null {
  const row = getDatabase().sqlite.prepare(`SELECT * FROM melody_jobs WHERE video_id=? AND status IN ('queued','processing')
    ORDER BY updated_at_ms DESC LIMIT 1`).get(videoId) as JobRow | undefined;
  return row ? mapRow(row) : null;
}

export function countActiveMelodyJobsForUser(userId: string): number {
  const row = getDatabase().sqlite.prepare(`SELECT COUNT(*) AS n FROM melody_jobs WHERE requested_by=?
    AND status IN ('queued','processing')`).get(userId) as { n: number };
  return row.n;
}

/** GPU jobs (stems + melody) created before this one that have not finished yet. */
export function countGpuJobsAhead(job: MelodyJobRecord): number {
  const row = getDatabase().sqlite.prepare(`SELECT
      (SELECT COUNT(*) FROM melody_jobs WHERE status IN ('queued','processing') AND created_at_ms < ? AND job_id != ?)
    + (SELECT COUNT(*) FROM stem_jobs WHERE status IN ('queued','processing') AND created_at_ms < ?) AS n`)
    .get(job.createdAtMs, job.jobId, job.createdAtMs) as { n: number };
  return row.n;
}

export function claimNextMelodyJob(leaseMs: number): MelodyJobRecord | null {
  const { sqlite } = getDatabase();
  const now = Date.now();
  return sqlite.transaction(() => {
    const row = sqlite.prepare(`SELECT * FROM melody_jobs WHERE
      (status='queued' AND next_attempt_at_ms<=?) OR (status='processing' AND lease_expires_at_ms<=?)
      ORDER BY created_at_ms LIMIT 1`).get(now, now) as JobRow | undefined;
    if (!row) return null;
    const updated = sqlite.prepare(`UPDATE melody_jobs SET status='processing', attempt_count=attempt_count+1,
      lease_expires_at_ms=?, updated_at_ms=? WHERE job_id=? AND updated_at_ms=?`)
      .run(now + leaseMs, now, row.job_id, row.updated_at_ms);
    if (!updated.changes) return null;
    return mapRow(sqlite.prepare('SELECT * FROM melody_jobs WHERE job_id=?').get(row.job_id) as JobRow);
  })();
}

export function updateMelodyJobStage(jobId: string, stage: MelodyJobStage, progress: number | null = null): void {
  getDatabase().sqlite.prepare('UPDATE melody_jobs SET stage=?, progress=?, updated_at_ms=? WHERE job_id=?')
    .run(stage, progress, Date.now(), jobId);
}

export function updateMelodyJobProgress(jobId: string, progress: number): void {
  getDatabase().sqlite.prepare("UPDATE melody_jobs SET progress=?, updated_at_ms=? WHERE job_id=? AND status='processing'")
    .run(Math.max(0, Math.min(1, progress)), Date.now(), jobId);
}

/**
 * Put the job back in the queue while it waits for its stem separation, without spending an attempt.
 * `stemJobId` remembers which separation it waits on, so a failed separation can fail the melody job.
 */
export function deferMelodyJobForStems(job: MelodyJobRecord, stemJobId: string | undefined, delayMs = 2_000): void {
  const now = Date.now();
  getDatabase().sqlite.prepare(`UPDATE melody_jobs SET status='queued', stage='waiting_stems', stem_job_id=?, progress=NULL,
    attempt_count=MAX(0, attempt_count-1), lease_expires_at_ms=NULL, next_attempt_at_ms=?, updated_at_ms=? WHERE job_id=?`)
    .run(stemJobId ?? job.stemJobId ?? null, now + delayMs, now, job.jobId);
}

export function completeMelodyJob(jobId: string): void {
  const now = Date.now();
  getDatabase().sqlite.prepare(`UPDATE melody_jobs SET status='completed', stage='done', progress=1, error=NULL,
    lease_expires_at_ms=NULL, updated_at_ms=?, completed_at_ms=? WHERE job_id=?`).run(now, now, jobId);
}

/** Retry with exponential backoff, or fail permanently (also when `permanent` is set). */
export function retryOrFailMelodyJob(job: MelodyJobRecord, error: string, maxAttempts = 2, permanent = false): void {
  const now = Date.now();
  const failed = permanent || job.attemptCount >= maxAttempts;
  const delay = 10_000 * 2 ** Math.max(0, job.attemptCount - 1);
  getDatabase().sqlite.prepare(`UPDATE melody_jobs SET status=?, error=?, lease_expires_at_ms=NULL,
    next_attempt_at_ms=?, updated_at_ms=?, completed_at_ms=? WHERE job_id=?`)
    .run(failed ? 'failed' : 'queued', error.slice(0, 2000), now + delay, now, failed ? now : null, job.jobId);
}

/** Drop finished jobs older than a week; the melody document keeps the result. */
export function pruneOldMelodyJobs(nowMs = Date.now()): number {
  return getDatabase().sqlite.prepare(`DELETE FROM melody_jobs WHERE status IN ('completed','failed') AND updated_at_ms < ?`)
    .run(nowMs - 7 * 86_400_000).changes;
}
