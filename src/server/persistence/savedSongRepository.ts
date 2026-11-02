import 'server-only';
import { getDatabase } from './database';

/** A custom display name for a song. Songs with one keep their cached audio (see claimAudioForEviction). */
export interface SongNameRecord {
  videoId: string;
  name: string;
  savedByUserId: string;
}

type SongNameRow = { video_id: string; name: string; saved_by_user_id: string };

export function getSongName(videoId: string): SongNameRecord | null {
  const row = getDatabase().sqlite.prepare('SELECT video_id, name, saved_by_user_id FROM saved_songs WHERE video_id = ?')
    .get(videoId) as SongNameRow | undefined;
  return row ? { videoId: row.video_id, name: row.name, savedByUserId: row.saved_by_user_id } : null;
}

/** Set or change a name. The person who first named the song stays on record after a rename. */
export function upsertSongName(videoId: string, name: string, userId: string): SongNameRecord {
  const now = Date.now();
  getDatabase().sqlite.prepare(`INSERT INTO saved_songs(video_id, name, saved_by_user_id, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET name = excluded.name, updated_at_ms = excluded.updated_at_ms`)
    .run(videoId, name, userId, now, now);
  return getSongName(videoId)!;
}

export function deleteSongName(videoId: string): boolean {
  return getDatabase().sqlite.prepare('DELETE FROM saved_songs WHERE video_id = ?').run(videoId).changes > 0;
}
