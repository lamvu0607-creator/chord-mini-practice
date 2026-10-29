import 'server-only';
import crypto from 'crypto';
import { getDatabase } from '@/server/persistence/database';
import type { StemJob, StemJobStatus } from '@/types/stems';

export interface StemJobRecord extends StemJob {
  requestedBy?: string;
  inputPath: string;
  nextAttemptAtMs: number;
  leaseExpiresAtMs?: number;
  completedAtMs?: number;
}

type JobRow = {
  job_id: string; source_id: string; status: StemJobStatus; requested_by: string | null; input_path: string;
  error: string | null; attempt_count: number; next_attempt_at_ms: number; lease_expires_at_ms: number | null;
  created_at_ms: number; updated_at_ms: number; completed_at_ms: number | null;
};

function mapRow(row: JobRow): StemJobRecord {
  return {
    jobId: row.job_id, sourceId: row.source_id, status: row.status, requestedBy: row.requested_by ?? undefined,
    inputPath: row.input_path, error: row.error, attemptCount: row.attempt_count, nextAttemptAtMs: row.next_attempt_at_ms,
    leaseExpiresAtMs: row.lease_expires_at_ms ?? undefined, createdAtMs: row.created_at_ms, updatedAtMs: row.updated_at_ms,
    completedAtMs: row.completed_at_ms ?? undefined,
  };
}

export function toPublicStemJob(job: StemJobRecord, progress?: number): StemJob {
  return {
    jobId: job.jobId, sourceId: job.sourceId, status: job.status, error: job.error, attemptCount: job.attemptCount,
    progress, createdAtMs: job.createdAtMs, updatedAtMs: job.updatedAtMs,
  };
}

export function createStemJob(input: { sourceId: string; inputPath: string; requestedBy?: string }): StemJobRecord {
  const now = Date.now();
  const jobId = `stem_${now}_${crypto.randomUUID()}`;
  getDatabase().sqlite.prepare(`INSERT INTO stem_jobs(job_id,source_id,status,requested_by,input_path,attempt_count,
      next_attempt_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,'queued',?,?,0,?,?,?)`)
    .run(jobId, input.sourceId, input.requestedBy ?? null, input.inputPath, now, now, now);
  return getStemJob(jobId)!;
}

export function getStemJob(jobId: string): StemJobRecord | null {
  const row = getDatabase().sqlite.prepare('SELECT * FROM stem_jobs WHERE job_id=?').get(jobId) as JobRow | undefined;
  return row ? mapRow(row) : null;
}

export function findActiveStemJob(sourceId: string): StemJobRecord | null {
  const row = getDatabase().sqlite.prepare(`SELECT * FROM stem_jobs WHERE source_id=? AND status IN ('queued','processing')
    ORDER BY updated_at_ms DESC LIMIT 1`).get(sourceId) as JobRow | undefined;
  return row ? mapRow(row) : null;
}

export function countActiveStemJobsForUser(userId: string): number {
  const row = getDatabase().sqlite.prepare(`SELECT COUNT(*) AS n FROM stem_jobs WHERE requested_by=?
    AND status IN ('queued','processing')`).get(userId) as { n: number };
  return row.n;
}

/** Number of jobs ahead of this one in the queue (0 when it is next or running). */
export function countJobsAhead(job: StemJobRecord): number {
  const row = getDatabase().sqlite.prepare(`SELECT COUNT(*) AS n FROM stem_jobs WHERE status IN ('queued','processing')
    AND created_at_ms < ? AND job_id != ?`).get(job.createdAtMs, job.jobId) as { n: number };
  return row.n;
}

/** Relative input paths of queued/processing jobs; that audio must not be evicted. */
export function listActiveStemJobInputPaths(): string[] {
  const rows = getDatabase().sqlite.prepare("SELECT input_path FROM stem_jobs WHERE status IN ('queued','processing')")
    .all() as Array<{ input_path: string }>;
  return rows.map((row) => row.input_path);
}

export function claimNextStemJob(leaseMs: number): StemJobRecord | null {
  const { sqlite } = getDatabase();
  const now = Date.now();
  return sqlite.transaction(() => {
    const row = sqlite.prepare(`SELECT * FROM stem_jobs WHERE
      (status='queued' AND next_attempt_at_ms<=?) OR (status='processing' AND lease_expires_at_ms<=?)
      ORDER BY created_at_ms LIMIT 1`).get(now, now) as JobRow | undefined;
    if (!row) return null;
    const updated = sqlite.prepare(`UPDATE stem_jobs SET status='processing', attempt_count=attempt_count+1,
      lease_expires_at_ms=?, updated_at_ms=? WHERE job_id=? AND updated_at_ms=?`)
      .run(now + leaseMs, now, row.job_id, row.updated_at_ms);
    if (!updated.changes) return null;
    return mapRow(sqlite.prepare('SELECT * FROM stem_jobs WHERE job_id=?').get(row.job_id) as JobRow);
  })();
}

export function completeStemJob(jobId: string): void {
  const now = Date.now();
  getDatabase().sqlite.prepare(`UPDATE stem_jobs SET status='completed', error=NULL, lease_expires_at_ms=NULL,
    updated_at_ms=?, completed_at_ms=? WHERE job_id=?`).run(now, now, jobId);
}

/** Retry with exponential backoff, or fail permanently (also when `permanent` is set). */
export function retryOrFailStemJob(job: StemJobRecord, error: string, maxAttempts = 2, permanent = false): void {
  const now = Date.now();
  const failed = permanent || job.attemptCount >= maxAttempts;
  const delay = 10_000 * 2 ** Math.max(0, job.attemptCount - 1);
  getDatabase().sqlite.prepare(`UPDATE stem_jobs SET status=?, error=?, lease_expires_at_ms=NULL,
    next_attempt_at_ms=?, updated_at_ms=?, completed_at_ms=? WHERE job_id=?`)
    .run(failed ? 'failed' : 'queued', error.slice(0, 2000), now + delay, now, failed ? now : null, job.jobId);
}

/** Drop finished jobs older than a week; the stem set row keeps the result. */
export function pruneOldStemJobs(nowMs = Date.now()): number {
  return getDatabase().sqlite.prepare(`DELETE FROM stem_jobs WHERE status IN ('completed','failed') AND updated_at_ms < ?`)
    .run(nowMs - 7 * 86_400_000).changes;
}
