CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS transcriptions (
  id TEXT PRIMARY KEY, video_id TEXT NOT NULL, beat_model TEXT NOT NULL, chord_model TEXT NOT NULL,
  title TEXT, channel_title TEXT, thumbnail TEXT, audio_url TEXT, key_signature TEXT, bpm INTEGER,
  time_signature INTEGER, is_primary_variant INTEGER NOT NULL DEFAULT 0, display_priority INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS transcriptions_variant_unique ON transcriptions(video_id, beat_model, chord_model);
CREATE INDEX IF NOT EXISTS transcriptions_video_idx ON transcriptions(video_id);
CREATE INDEX IF NOT EXISTS transcriptions_recent_idx ON transcriptions(is_primary_variant, created_at_ms DESC, id DESC);
CREATE TABLE IF NOT EXISTS transcription_search_keys (
  transcription_id TEXT NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,
  search_key TEXT NOT NULL, PRIMARY KEY (transcription_id, search_key)
);
CREATE INDEX IF NOT EXISTS transcription_search_key_idx ON transcription_search_keys(search_key, transcription_id);
CREATE TABLE IF NOT EXISTS melodies (video_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS lyrics (video_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS translations (cache_key TEXT PRIMARY KEY, video_id TEXT, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS key_detections (cache_key TEXT PRIMARY KEY, video_id TEXT, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS status_reports (report_date TEXT PRIMARY KEY, payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, expires_at_ms INTEGER);
CREATE TABLE IF NOT EXISTS audio_files (
  video_id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, file_size INTEGER NOT NULL, mime_type TEXT,
  title TEXT, duration_ms INTEGER, created_at_ms INTEGER NOT NULL, last_accessed_at_ms INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS audio_files_lru_idx ON audio_files(state, last_accessed_at_ms);
CREATE TABLE IF NOT EXISTS segmentation_jobs (
  job_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, status TEXT NOT NULL, title TEXT, video_id TEXT,
  upload_id TEXT, audio_url TEXT NOT NULL, song_context_json TEXT NOT NULL, result_json TEXT, error TEXT,
  model TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at_ms INTEGER NOT NULL,
  lease_expires_at_ms INTEGER, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS segmentation_jobs_request_idx ON segmentation_jobs(request_hash, status, updated_at_ms DESC);
CREATE INDEX IF NOT EXISTS segmentation_jobs_queue_idx ON segmentation_jobs(status, next_attempt_at_ms, lease_expires_at_ms);
CREATE TABLE IF NOT EXISTS maintenance_locks (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at_ms INTEGER NOT NULL);
