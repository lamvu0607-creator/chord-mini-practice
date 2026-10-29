import 'server-only';
import { getDatabase } from './database';

export interface AudioMetadataRecord {
  videoId: string;
  filename: string;
  fileSize: number;
  mimeType?: string;
  title?: string;
  duration?: number;
  createdAtMs: number;
  lastAccessedAtMs: number;
  state: 'active' | 'deleting';
}

type AudioRow = {
  video_id: string; filename: string; file_size: number; mime_type: string | null; title: string | null;
  duration_ms: number | null; created_at_ms: number; last_accessed_at_ms: number; state: 'active' | 'deleting';
};

function mapRow(row: AudioRow): AudioMetadataRecord {
  return {
    videoId: row.video_id, filename: row.filename, fileSize: row.file_size,
    mimeType: row.mime_type ?? undefined, title: row.title ?? undefined,
    duration: row.duration_ms == null ? undefined : row.duration_ms / 1000,
    createdAtMs: row.created_at_ms, lastAccessedAtMs: row.last_accessed_at_ms, state: row.state,
  };
}

export function upsertAudioMetadata(input: Omit<AudioMetadataRecord, 'createdAtMs' | 'lastAccessedAtMs' | 'state'> & { createdAtMs?: number }) {
  const { sqlite } = getDatabase();
  const now = Date.now();
  sqlite.prepare(`INSERT INTO audio_files(video_id, filename, file_size, mime_type, title, duration_ms, created_at_ms, last_accessed_at_ms, state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    ON CONFLICT(video_id) DO UPDATE SET filename=excluded.filename, file_size=excluded.file_size,
      mime_type=excluded.mime_type, title=COALESCE(excluded.title, audio_files.title),
      duration_ms=COALESCE(excluded.duration_ms, audio_files.duration_ms), last_accessed_at_ms=excluded.last_accessed_at_ms, state='active'`)
    .run(input.videoId, input.filename, input.fileSize, input.mimeType ?? null, input.title ?? null,
      input.duration == null ? null : Math.round(input.duration * 1000), input.createdAtMs ?? now, now);
}

export function findAudioMetadataByVideoId(videoId: string): AudioMetadataRecord | null {
  const row = getDatabase().sqlite.prepare("SELECT * FROM audio_files WHERE video_id = ? AND state = 'active'").get(videoId) as AudioRow | undefined;
  return row ? mapRow(row) : null;
}

export function findAudioMetadataByFilename(filename: string): AudioMetadataRecord | null {
  const row = getDatabase().sqlite.prepare("SELECT * FROM audio_files WHERE filename = ? AND state = 'active'").get(filename) as AudioRow | undefined;
  return row ? mapRow(row) : null;
}

export function listAudioMetadata(): AudioMetadataRecord[] {
  return (getDatabase().sqlite.prepare("SELECT * FROM audio_files WHERE state = 'active'").all() as AudioRow[]).map(mapRow);
}

export function touchAudioMetadata(filename: string): void {
  getDatabase().sqlite.prepare("UPDATE audio_files SET last_accessed_at_ms = ? WHERE filename = ? AND state = 'active'").run(Date.now(), filename);
}

export function removeAudioMetadata(filename: string): void {
  getDatabase().sqlite.prepare('DELETE FROM audio_files WHERE filename = ?').run(filename);
}

export function getAudioUsageBytes(): number {
  const row = getDatabase().sqlite.prepare("SELECT COALESCE(SUM(file_size), 0) AS bytes FROM audio_files WHERE state = 'active'").get() as { bytes: number };
  return row.bytes;
}

export function claimAudioForEviction(targetBytes: number): AudioMetadataRecord[] {
  const { sqlite } = getDatabase();
  return sqlite.transaction(() => {
    const maintenanceLock = sqlite.prepare(
      "SELECT 1 FROM maintenance_locks WHERE name='audio-maintenance' AND expires_at_ms > ?",
    ).get(Date.now());
    if (maintenanceLock) return [];
    // Audio waiting to be split into stems must survive until its job finishes.
    // Uploaded audio (upload_*) cannot be re-downloaded like YouTube audio, so it is never evicted.
    const protectedFilenames = new Set(
      (sqlite.prepare("SELECT input_path FROM stem_jobs WHERE status IN ('queued','processing')").all() as Array<{ input_path: string }>)
        .map((row) => row.input_path.split('/').pop()),
    );
    const rows = (sqlite.prepare("SELECT * FROM audio_files WHERE state='active' AND video_id NOT LIKE 'upload!_%' ESCAPE '!' ORDER BY last_accessed_at_ms ASC")
      .all() as AudioRow[]).filter((row) => !protectedFilenames.has(row.filename));
    const claimed: AudioRow[] = [];
    let bytes = 0;
    const mark = sqlite.prepare("UPDATE audio_files SET state='deleting' WHERE filename=? AND state='active'");
    for (const row of rows) {
      if (bytes >= targetBytes) break;
      if (mark.run(row.filename).changes) { claimed.push(row); bytes += row.file_size; }
    }
    return claimed.map(mapRow);
  })();
}

export function releaseAudioEviction(filename: string): void {
  getDatabase().sqlite.prepare("UPDATE audio_files SET state='active' WHERE filename=? AND state='deleting'").run(filename);
}
