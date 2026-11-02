import 'server-only';
import type { AuthenticatedUser } from '@/server/auth/authRepository';
import { getDatabase } from '@/server/persistence/database';
import { findVideoTranscriptions } from '@/server/persistence/transcriptionRepository';
import type { StemFile, StemSet, StemSetStatus, StemSourceType } from '@/types/stems';

type StoredStem = Omit<StemFile, 'url'>;

export interface StemSetRecord {
  sourceId: string;
  sourceType: StemSourceType;
  videoId?: string;
  ownerUserId?: string;
  title?: string;
  inputPath: string;
  status: StemSetStatus;
  model?: string;
  stems: StoredStem[];
  durationMs?: number;
  totalBytes: number;
  createdAtMs: number;
  updatedAtMs: number;
  lastAccessedAtMs: number;
}

type StemSetRow = {
  source_id: string; source_type: StemSourceType; video_id: string | null; owner_user_id: string | null;
  title: string | null; input_path: string; status: StemSetStatus; model: string | null; stems_json: string | null;
  duration_ms: number | null; total_bytes: number; created_at_ms: number; updated_at_ms: number; last_accessed_at_ms: number;
};

function mapRow(row: StemSetRow): StemSetRecord {
  return {
    sourceId: row.source_id, sourceType: row.source_type, videoId: row.video_id ?? undefined,
    ownerUserId: row.owner_user_id ?? undefined, title: row.title ?? undefined, inputPath: row.input_path,
    status: row.status, model: row.model ?? undefined, stems: row.stems_json ? JSON.parse(row.stems_json) : [],
    durationMs: row.duration_ms ?? undefined, totalBytes: row.total_bytes, createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms, lastAccessedAtMs: row.last_accessed_at_ms,
  };
}

export function getStemSet(sourceId: string): StemSetRecord | null {
  const row = getDatabase().sqlite.prepare('SELECT * FROM stem_sets WHERE source_id=?').get(sourceId) as StemSetRow | undefined;
  return row ? mapRow(row) : null;
}

/** Create the set row, or refresh its input/title while it has not produced stems yet. */
export function upsertPendingStemSet(input: {
  sourceId: string; sourceType: StemSourceType; videoId?: string; ownerUserId?: string; title?: string; inputPath: string;
}): StemSetRecord {
  const now = Date.now();
  getDatabase().sqlite.prepare(`INSERT INTO stem_sets(source_id,source_type,video_id,owner_user_id,title,input_path,status,
      created_at_ms,updated_at_ms,last_accessed_at_ms) VALUES (?,?,?,?,?,?,'pending',?,?,?)
    ON CONFLICT(source_id) DO UPDATE SET
      input_path=CASE WHEN stem_sets.status='ready' THEN stem_sets.input_path ELSE excluded.input_path END,
      title=COALESCE(excluded.title, stem_sets.title), updated_at_ms=excluded.updated_at_ms`)
    .run(input.sourceId, input.sourceType, input.videoId ?? null, input.ownerUserId ?? null, input.title ?? null,
      input.inputPath, now, now, now);
  return getStemSet(input.sourceId)!;
}

export function markStemSetReady(sourceId: string, result: {
  model: string; stems: StoredStem[]; durationMs?: number;
}): void {
  const now = Date.now();
  const totalBytes = result.stems.reduce((sum, stem) => sum + (stem.bytes || 0), 0);
  getDatabase().sqlite.prepare(`UPDATE stem_sets SET status='ready', model=?, stems_json=?, duration_ms=?, total_bytes=?,
      updated_at_ms=?, last_accessed_at_ms=? WHERE source_id=?`)
    .run(result.model, JSON.stringify(result.stems), result.durationMs ?? null, totalBytes, now, now, sourceId);
}

export function touchStemSet(sourceId: string): void {
  getDatabase().sqlite.prepare('UPDATE stem_sets SET last_accessed_at_ms=? WHERE source_id=?').run(Date.now(), sourceId);
}

export function deleteStemSetRow(sourceId: string): void {
  const { sqlite } = getDatabase();
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM stem_jobs WHERE source_id=?').run(sourceId);
    sqlite.prepare('DELETE FROM stem_sets WHERE source_id=?').run(sourceId);
  })();
}

export function canViewStemSet(record: StemSetRecord, user: AuthenticatedUser | null): boolean {
  if (record.sourceType === 'youtube') return true;
  return Boolean(user && (user.role === 'admin' || user.userId === record.ownerUserId));
}

export function canDeleteStemSet(record: StemSetRecord, user: AuthenticatedUser | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || (record.sourceType === 'upload' && user.userId === record.ownerUserId);
}

/** Ready YouTube sets plus the viewer's own uploads, newest first. */
export function listVisibleStemSets(user: AuthenticatedUser | null, limit = 50): StemSetRecord[] {
  const rows = getDatabase().sqlite.prepare(`SELECT * FROM stem_sets WHERE status='ready'
      AND (source_type='youtube' OR (? = 1) OR owner_user_id = ?)
    ORDER BY updated_at_ms DESC LIMIT ?`)
    .all(user?.role === 'admin' ? 1 : 0, user?.userId ?? '', limit) as StemSetRow[];
  return rows.map(mapRow);
}

export function getStemStorageUsageBytes(): number {
  const row = getDatabase().sqlite.prepare("SELECT COALESCE(SUM(total_bytes),0) AS bytes FROM stem_sets WHERE status='ready'")
    .get() as { bytes: number };
  return row.bytes;
}

/** Least recently used ready sets with no queued/processing stem or melody job, oldest first. */
export function listEvictableStemSets(): StemSetRecord[] {
  const rows = getDatabase().sqlite.prepare(`SELECT * FROM stem_sets s WHERE s.status='ready'
      AND NOT EXISTS (SELECT 1 FROM stem_jobs j WHERE j.source_id=s.source_id AND j.status IN ('queued','processing'))
      AND NOT EXISTS (SELECT 1 FROM melody_jobs m WHERE m.source_id=s.source_id AND m.status IN ('queued','processing'))
    ORDER BY s.last_accessed_at_ms ASC`).all() as StemSetRow[];
  return rows.map(mapRow);
}

export function toPublicStemSet(record: StemSetRecord, user: AuthenticatedUser | null): StemSet {
  return {
    sourceId: record.sourceId,
    sourceType: record.sourceType,
    videoId: record.videoId,
    title: record.title
      ?? (record.videoId ? findVideoTranscriptions(record.videoId).find((entry) => entry.title)?.title : undefined),
    status: record.status,
    model: record.model,
    duration: record.durationMs !== undefined ? record.durationMs / 1000 : undefined,
    stems: record.stems.map((stem) => ({ ...stem, url: `/api/stems/${record.sourceId}/${stem.name}` })),
    totalBytes: record.totalBytes,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    canDelete: canDeleteStemSet(record, user),
  };
}
