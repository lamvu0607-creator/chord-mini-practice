import 'server-only';
import { getDatabase } from './database';

const COLLECTION_TABLES = {
  melody: { table: 'melodies', key: 'video_id' },
  lyrics: { table: 'lyrics', key: 'video_id' },
  translations: { table: 'translations', key: 'cache_key' },
  keyDetections: { table: 'key_detections', key: 'cache_key' },
  statusReports: { table: 'status_reports', key: 'report_date' },
} as const;

export type LocalDocumentCollection = keyof typeof COLLECTION_TABLES;

function tableFor(collection: LocalDocumentCollection) {
  const table = COLLECTION_TABLES[collection];
  if (!table) throw new Error(`Unsupported local document collection: ${collection}`);
  return table;
}

export function getLocalDocument<T>(collection: LocalDocumentCollection, key: string): T | null {
  const { sqlite } = getDatabase();
  const mapping = tableFor(collection);
  const row = sqlite.prepare(`SELECT payload_json FROM ${mapping.table} WHERE ${mapping.key} = ?`).get(key) as { payload_json: string } | undefined;
  return row ? JSON.parse(row.payload_json) as T : null;
}

export function setLocalDocument(
  collection: LocalDocumentCollection,
  key: string,
  value: Record<string, unknown>,
): void {
  const { sqlite } = getDatabase();
  const mapping = tableFor(collection);
  const now = Date.now();
  const createdAt = typeof value.createdAtMs === 'number' ? value.createdAtMs : now;
  const expiresAt = typeof value.expiresAtMs === 'number' ? value.expiresAtMs : null;
  const videoId = typeof value.videoId === 'string' ? value.videoId : null;
  if (mapping.table === 'melodies' || mapping.table === 'lyrics' || mapping.table === 'status_reports') {
    sqlite.prepare(`
      INSERT INTO ${mapping.table} (${mapping.key}, payload_json, created_at_ms, updated_at_ms, expires_at_ms)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(${mapping.key}) DO UPDATE SET payload_json = excluded.payload_json,
        updated_at_ms = excluded.updated_at_ms, expires_at_ms = excluded.expires_at_ms
    `).run(key, JSON.stringify(value), createdAt, now, expiresAt);
    return;
  }

  sqlite.prepare(`
    INSERT INTO ${mapping.table} (${mapping.key}, video_id, payload_json, created_at_ms, updated_at_ms, expires_at_ms)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(${mapping.key}) DO UPDATE SET
      video_id = excluded.video_id, payload_json = excluded.payload_json,
      updated_at_ms = excluded.updated_at_ms, expires_at_ms = excluded.expires_at_ms
  `).run(key, videoId, JSON.stringify(value), createdAt, now, expiresAt);
}

export function listLocalDocuments<T>(collection: LocalDocumentCollection, limit = 100): T[] {
  const { sqlite } = getDatabase();
  const mapping = tableFor(collection);
  const rows = sqlite.prepare(`SELECT payload_json FROM ${mapping.table} ORDER BY updated_at_ms DESC LIMIT ?`).all(Math.max(1, limit)) as Array<{ payload_json: string }>;
  return rows.map((row) => JSON.parse(row.payload_json) as T);
}

export function deleteLocalDocuments(collection: LocalDocumentCollection, keys: string[]): number {
  if (keys.length === 0) return 0;
  const { sqlite } = getDatabase();
  const mapping = tableFor(collection);
  const remove = sqlite.prepare(`DELETE FROM ${mapping.table} WHERE ${mapping.key} = ?`);
  return sqlite.transaction((items: string[]) => items.reduce((count, key) => count + remove.run(key).changes, 0))(keys);
}
