import 'server-only';
import { buildSearchableKeys } from '@/utils/keySignatureUtils';
import { isUploadSourceId } from '@/utils/uploadSourceId';
import { normalizeThumbnailUrl } from '@/utils/youtubeMetadata';
import { buildTranscriptionId, type TranscriptionData, type TranscriptionEnrichmentUpdate } from '@/types/transcription';
import { getDatabase } from './database';
import { toRelativeLocalAudioUrl } from '@/utils/localAudioUrl';

type TranscriptionRow = {
  id: string; video_id: string; beat_model: string; chord_model: string; title: string | null;
  channel_title: string | null; thumbnail: string | null; audio_url: string | null; key_signature: string | null;
  bpm: number | null; time_signature: number | null; is_primary_variant: number; display_priority: number | null;
  usage_count: number; payload_json: string; created_at_ms: number; updated_at_ms: number;
};

function parseRow(row: TranscriptionRow): TranscriptionData {
  const data = JSON.parse(row.payload_json) as TranscriptionData;
  // Rows written before relative URLs carry the old host (often localhost:3000).
  return data.audioUrl ? { ...data, audioUrl: toRelativeLocalAudioUrl(data.audioUrl) } : data;
}

function variantScore(beatModel: string, chordModel: string): number {
  // Lower is preferred as the primary variant shown for a video
  const beatRank: Record<string, number> = { 'beat-this': 0, madmom: 1, 'beat-transformer': 2 };
  const chordRank: Record<string, number> = { 'btc-cl': 0, 'btc-pl': 1, 'btc-sl': 2, 'chord-cnn-lstm': 3 };
  return (beatRank[beatModel] ?? 99) * 100 + (chordRank[chordModel] ?? 99);
}

function rerankVideo(videoId: string) {
  const { sqlite } = getDatabase();
  const rows = sqlite.prepare('SELECT * FROM transcriptions WHERE video_id = ?').all(videoId) as TranscriptionRow[];
  rows.sort((a, b) => variantScore(a.beat_model, a.chord_model) - variantScore(b.beat_model, b.chord_model)
    || b.created_at_ms - a.created_at_ms || a.id.localeCompare(b.id));
  const update = sqlite.prepare('UPDATE transcriptions SET is_primary_variant = ?, display_priority = ?, payload_json = ?, updated_at_ms = ? WHERE id = ?');
  const clearKeys = sqlite.prepare('DELETE FROM transcription_search_keys WHERE transcription_id = ?');
  const addKey = sqlite.prepare('INSERT OR IGNORE INTO transcription_search_keys(transcription_id, search_key) VALUES (?, ?)');
  const now = Date.now();
  rows.forEach((row, index) => {
    const payload = parseRow(row);
    payload.isPrimaryVariant = index === 0;
    payload.displayPriority = index + 1;
    payload.searchableKeys = buildSearchableKeys(payload.keySignature ?? payload.primaryKey ?? null);
    update.run(index === 0 ? 1 : 0, index + 1, JSON.stringify(payload), now, row.id);
    clearKeys.run(row.id);
    payload.searchableKeys.forEach((key) => addKey.run(row.id, key));
  });
}

export function findTranscription(videoId: string, beatModel: string, chordModel: string): TranscriptionData | null {
  const row = getDatabase().sqlite.prepare('SELECT * FROM transcriptions WHERE id = ?')
    .get(buildTranscriptionId(videoId, beatModel, chordModel)) as TranscriptionRow | undefined;
  return row ? parseRow(row) : null;
}

export function findVideoTranscriptions(videoId: string): TranscriptionData[] {
  return (getDatabase().sqlite.prepare('SELECT * FROM transcriptions WHERE video_id = ? ORDER BY display_priority').all(videoId) as TranscriptionRow[]).map(parseRow);
}

/** Remove every model variant of a video (and its search keys); returns how many were deleted. */
export function deleteVideoTranscriptions(videoId: string): number {
  const { sqlite } = getDatabase();
  return sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM transcription_search_keys WHERE transcription_id IN (SELECT id FROM transcriptions WHERE video_id = ?)')
      .run(videoId);
    return sqlite.prepare('DELETE FROM transcriptions WHERE video_id = ?').run(videoId).changes;
  })();
}

export function upsertTranscription(input: Omit<TranscriptionData, 'createdAt'> & { createdAt?: number }): TranscriptionData {
  const { sqlite } = getDatabase();
  const now = Date.now();
  const id = buildTranscriptionId(input.videoId, input.beatModel, input.chordModel);
  const existing = sqlite.prepare('SELECT created_at_ms FROM transcriptions WHERE id = ?').get(id) as { created_at_ms: number } | undefined;
  const createdAt = input.createdAt ?? existing?.created_at_ms ?? now;
  const keySignature = input.keySignature ?? input.primaryKey ?? null;
  const payload: TranscriptionData = {
    ...input,
    audioUrl: toRelativeLocalAudioUrl(input.audioUrl),
    thumbnail: normalizeThumbnailUrl(input.videoId, input.thumbnail, 'mqdefault') || undefined,
    primaryKey: keySignature,
    searchableKeys: buildSearchableKeys(keySignature),
    usageCount: Math.max(0, input.usageCount ?? 0),
    createdAt,
  };

  sqlite.transaction(() => {
    sqlite.prepare(`INSERT INTO transcriptions (
      id, video_id, beat_model, chord_model, title, channel_title, thumbnail, audio_url, key_signature,
      bpm, time_signature, usage_count, payload_json, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, channel_title=excluded.channel_title,
      thumbnail=excluded.thumbnail, audio_url=excluded.audio_url, key_signature=excluded.key_signature,
      bpm=excluded.bpm, time_signature=excluded.time_signature, usage_count=excluded.usage_count,
      payload_json=excluded.payload_json, updated_at_ms=excluded.updated_at_ms`)
      .run(id, payload.videoId, payload.beatModel, payload.chordModel, payload.title ?? null,
        payload.channelTitle ?? null, payload.thumbnail ?? null, payload.audioUrl ?? null, keySignature,
        payload.bpm ?? null, payload.timeSignature ?? null, payload.usageCount ?? 0,
        JSON.stringify(payload), createdAt, now);
    rerankVideo(payload.videoId);
  })();
  return findTranscription(payload.videoId, payload.beatModel, payload.chordModel)!;
}

export function enrichTranscription(videoId: string, beatModel: string, chordModel: string, enrichment: TranscriptionEnrichmentUpdate): TranscriptionData | null {
  const existing = findTranscription(videoId, beatModel, chordModel);
  if (!existing) return null;
  return upsertTranscription({
    ...existing,
    ...enrichment,
    title: enrichment.title ?? existing.title,
    channelTitle: enrichment.channelTitle ?? existing.channelTitle,
    thumbnail: enrichment.thumbnail ?? existing.thumbnail,
    primaryKey: enrichment.keySignature ?? existing.primaryKey,
    modulation: enrichment.keyModulation ?? existing.modulation,
    corrections: enrichment.chordCorrections ?? existing.corrections,
    correctedChords: enrichment.correctedChords ?? enrichment.sequenceCorrections?.correctedSequence ?? existing.correctedChords,
    originalChords: enrichment.originalChords ?? enrichment.sequenceCorrections?.originalSequence ?? existing.originalChords,
  });
}

export function incrementUsage(videoId: string, beatModel: string, chordModel: string): boolean {
  const { sqlite } = getDatabase();
  const id = buildTranscriptionId(videoId, beatModel, chordModel);
  return sqlite.transaction(() => {
    const row = sqlite.prepare('SELECT * FROM transcriptions WHERE id = ?').get(id) as TranscriptionRow | undefined;
    if (!row) return false;
    const payload = parseRow(row);
    payload.usageCount = (payload.usageCount ?? 0) + 1;
    sqlite.prepare('UPDATE transcriptions SET usage_count = usage_count + 1, payload_json = ?, updated_at_ms = ? WHERE id = ?')
      .run(JSON.stringify(payload), Date.now(), id);
    return true;
  })();
}

export type RecentVideo = {
  videoId: string; title?: string; channelTitle?: string; thumbnailUrl?: string; processedAt: number;
  duration?: number; beatModel?: string; chordModel?: string; bpm?: number; timeSignature?: number;
  keySignature?: string; usageCount?: number; customName?: string;
};

export function findRecentTranscriptions(options: {
  selectedKey: string; cursor?: string | null; limit: number;
  /** Uploads and clips are listed for signed-in users only; leave off for public lists. */
  includeUploads?: boolean;
  /** Custom names are returned and searched for signed-in users only. */
  includeCustomNames?: boolean;
  search?: string;
}) {
  const { sqlite } = getDatabase();
  let cursor: { createdAtMs: number; id: string } | null = null;
  if (options.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8')) as Partial<{ createdAtMs: number; id: string }>;
      if (!Number.isFinite(decoded.createdAtMs) || typeof decoded.id !== 'string' || !decoded.id || decoded.id.length > 512) {
        throw new Error('Malformed cursor');
      }
      cursor = { createdAtMs: decoded.createdAtMs!, id: decoded.id };
    } catch {
      throw new Error('Invalid pagination cursor');
    }
  }
  const selectedKeys = options.selectedKey === 'all' ? [] : buildSearchableKeys(options.selectedKey);
  const params: Array<string | number> = [];
  const nameColumn = options.includeCustomNames ? 's.name' : 'NULL';
  let sql = `SELECT t.*, a.title AS audio_title, ${nameColumn} AS custom_name FROM transcriptions t
    LEFT JOIN audio_files a ON a.video_id = t.video_id
    ${options.includeCustomNames ? 'LEFT JOIN saved_songs s ON s.video_id = t.video_id' : ''}
    WHERE t.is_primary_variant = 1`;
  if (!options.includeUploads) {
    sql += " AND t.video_id NOT LIKE 'upload!_%' ESCAPE '!'";
  }
  if (options.search) {
    const pattern = `%${options.search.replace(/[!%_]/g, '!$&')}%`;
    const columns = ['t.title', 'a.title', ...(options.includeCustomNames ? ['s.name'] : [])];
    sql += ` AND (${columns.map((column) => `${column} LIKE ? ESCAPE '!'`).join(' OR ')})`;
    params.push(...columns.map(() => pattern));
  }
  if (selectedKeys.length) {
    sql += ` AND EXISTS (SELECT 1 FROM transcription_search_keys k WHERE k.transcription_id=t.id AND k.search_key IN (${selectedKeys.map(() => '?').join(',')}))`;
    params.push(...selectedKeys);
  }
  if (cursor) {
    sql += ' AND (t.created_at_ms < ? OR (t.created_at_ms = ? AND t.id < ?))';
    params.push(cursor.createdAtMs, cursor.createdAtMs, cursor.id);
  }
  sql += ' ORDER BY t.created_at_ms DESC, t.id DESC LIMIT ?';
  params.push(options.limit + 1);
  const rows = sqlite.prepare(sql).all(...params) as Array<TranscriptionRow & { audio_title: string | null; custom_name: string | null }>;
  const hasMore = rows.length > options.limit;
  const page = rows.slice(0, options.limit);
  const videos: RecentVideo[] = page.map((row) => {
    const item = parseRow(row);
    return {
      videoId: item.videoId, title: item.title || row.audio_title || `Video ${item.videoId}`, channelTitle: item.channelTitle,
      customName: row.custom_name ?? undefined,
      // Uploads have no YouTube thumbnail to fall back on.
      thumbnailUrl: isUploadSourceId(item.videoId) ? (item.thumbnail ?? undefined) : normalizeThumbnailUrl(item.videoId, item.thumbnail, 'mqdefault'),
      processedAt: item.createdAt,
      duration: item.audioDuration, beatModel: item.beatModel, chordModel: item.chordModel,
      bpm: item.bpm ?? undefined, timeSignature: item.timeSignature ?? 4,
      keySignature: item.keySignature ?? item.primaryKey ?? undefined, usageCount: item.usageCount,
    };
  });
  const last = page.at(-1);
  return {
    videos, hasMore,
    nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ createdAtMs: last.created_at_ms, id: last.id })).toString('base64url') : null,
  };
}
