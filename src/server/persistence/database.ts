import 'server-only';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'fs';
import path from 'path';

import * as schema from './schema';

const DATABASE_SCHEMA_VERSION = 5;

const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  last_active_at_ms INTEGER NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at_ms);
CREATE TABLE IF NOT EXISTS transcriptions (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  beat_model TEXT NOT NULL,
  chord_model TEXT NOT NULL,
  title TEXT,
  channel_title TEXT,
  thumbnail TEXT,
  audio_url TEXT,
  key_signature TEXT,
  bpm INTEGER,
  time_signature INTEGER,
  is_primary_variant INTEGER NOT NULL DEFAULT 0,
  display_priority INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS transcriptions_variant_unique ON transcriptions(video_id, beat_model, chord_model);
CREATE INDEX IF NOT EXISTS transcriptions_video_idx ON transcriptions(video_id);
CREATE INDEX IF NOT EXISTS transcriptions_recent_idx ON transcriptions(is_primary_variant, created_at_ms DESC, id DESC);
CREATE TABLE IF NOT EXISTS transcription_search_keys (
  transcription_id TEXT NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,
  search_key TEXT NOT NULL,
  PRIMARY KEY (transcription_id, search_key)
);
CREATE INDEX IF NOT EXISTS transcription_search_key_idx ON transcription_search_keys(search_key, transcription_id);
CREATE TABLE IF NOT EXISTS melodies (video_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS lyrics (video_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS translations (cache_key TEXT PRIMARY KEY, video_id TEXT, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS key_detections (cache_key TEXT PRIMARY KEY, video_id TEXT, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS status_reports (report_date TEXT PRIMARY KEY, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS audio_files (
  video_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  title TEXT,
  duration_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  last_accessed_at_ms INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS audio_files_lru_idx ON audio_files(state, last_accessed_at_ms);
CREATE TABLE IF NOT EXISTS stem_sets (
  source_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  video_id TEXT,
  owner_user_id TEXT,
  title TEXT,
  input_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  model TEXT,
  stems_json TEXT,
  duration_ms INTEGER,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  last_accessed_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS stem_sets_lru_idx ON stem_sets(status, last_accessed_at_ms);
CREATE INDEX IF NOT EXISTS stem_sets_owner_idx ON stem_sets(owner_user_id, updated_at_ms DESC);
CREATE TABLE IF NOT EXISTS stem_jobs (
  job_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT,
  input_path TEXT NOT NULL,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER NOT NULL,
  lease_expires_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS stem_jobs_source_idx ON stem_jobs(source_id, status, updated_at_ms DESC);
CREATE INDEX IF NOT EXISTS stem_jobs_queue_idx ON stem_jobs(status, next_attempt_at_ms, lease_expires_at_ms);
CREATE TABLE IF NOT EXISTS maintenance_locks (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS anonymous_quotas (
  id TEXT PRIMARY KEY,
  ip_address TEXT,
  user_agent TEXT,
  used_count INTEGER NOT NULL DEFAULT 0,
  trial_video_id TEXT,
  first_used_at_ms INTEGER,
  last_used_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS anonymous_quotas_ip_idx ON anonymous_quotas(ip_address);
CREATE TABLE IF NOT EXISTS melody_jobs (
  job_id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'queued',
  requested_by TEXT,
  input_path TEXT NOT NULL,
  stem_job_id TEXT,
  progress REAL,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER NOT NULL,
  lease_expires_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS melody_jobs_video_idx ON melody_jobs(video_id, status, updated_at_ms DESC);
CREATE INDEX IF NOT EXISTS melody_jobs_queue_idx ON melody_jobs(status, next_attempt_at_ms, lease_expires_at_ms);
`;

type DatabaseState = {
  sqlite: BetterSqlite3.Database;
  orm: BetterSQLite3Database<typeof schema>;
};

const globalDatabase = globalThis as typeof globalThis & { __chordMiniDatabase?: DatabaseState };

export function getDatabasePath(): string {
  const configured = process.env.SQLITE_DATABASE_PATH?.trim();
  return path.resolve(configured || path.join(/*turbopackIgnore: true*/ process.cwd(), 'storage', 'db', 'chordmini.sqlite'));
}

function initializeDatabase(): DatabaseState {
  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new BetterSqlite3(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  const migrate = sqlite.transaction(() => {
    sqlite.exec(INITIAL_SCHEMA_SQL);
    const current = sqlite.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version?: number | null };
    const currentVersion = current?.version ?? 0;
    if (currentVersion < 2) {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          pin_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at_ms INTEGER NOT NULL,
          created_at_ms INTEGER NOT NULL,
          last_active_at_ms INTEGER NOT NULL,
          user_agent TEXT,
          ip_address TEXT
        );
        CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at_ms);
      `);
      sqlite.prepare('INSERT INTO schema_migrations(version, applied_at_ms) VALUES (?, ?)').run(2, Date.now());
    }
    if (currentVersion < 3) {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS anonymous_quotas (
          id TEXT PRIMARY KEY,
          ip_address TEXT,
          user_agent TEXT,
          used_count INTEGER NOT NULL DEFAULT 0,
          trial_video_id TEXT,
          first_used_at_ms INTEGER,
          last_used_at_ms INTEGER,
          created_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS anonymous_quotas_ip_idx ON anonymous_quotas(ip_address);
      `);
      sqlite.prepare('INSERT INTO schema_migrations(version, applied_at_ms) VALUES (?, ?)').run(3, Date.now());
    }
    if (currentVersion < 4) {
      // melody_jobs is created by INITIAL_SCHEMA_SQL (IF NOT EXISTS); this only records the version.
      sqlite.prepare('INSERT INTO schema_migrations(version, applied_at_ms) VALUES (?, ?)').run(4, Date.now());
    }
    if (currentVersion < DATABASE_SCHEMA_VERSION) {
      sqlite.exec(`
        ALTER TABLE audio_files ADD COLUMN owner_user_id TEXT;
        CREATE TABLE IF NOT EXISTS saved_songs (
          video_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          saved_by_user_id TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS saved_songs_updated_idx ON saved_songs(updated_at_ms);
      `);
      sqlite.prepare('INSERT INTO schema_migrations(version, applied_at_ms) VALUES (?, ?)').run(5, Date.now());
    }
  });
  migrate();

  return { sqlite, orm: drizzle(sqlite, { schema }) };
}

export function getDatabase(): DatabaseState {
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    throw new Error('SQLite persistence is server-only');
  }
  globalDatabase.__chordMiniDatabase ??= initializeDatabase();
  return globalDatabase.__chordMiniDatabase;
}

export function getDatabaseHealth() {
  const { sqlite } = getDatabase();
  const result = sqlite.prepare('PRAGMA quick_check').pluck().get();
  return {
    ready: result === 'ok',
    schemaVersion: DATABASE_SCHEMA_VERSION,
    databasePath: getDatabasePath(),
    journalMode: sqlite.pragma('journal_mode', { simple: true }),
  };
}

export function closeDatabaseForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test-only database reset is not available');
  globalDatabase.__chordMiniDatabase?.sqlite.close();
  delete globalDatabase.__chordMiniDatabase;
}
