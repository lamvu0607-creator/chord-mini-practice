import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  pinHash: text('pin_hash').notNull(),
  salt: text('salt').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
}, (table) => ({
  usernameIdx: uniqueIndex('users_username_idx').on(table.username),
}));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAtMs: integer('expires_at_ms').notNull(),
  createdAtMs: integer('created_at_ms').notNull(),
  lastActiveAtMs: integer('last_active_at_ms').notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
}, (table) => ({
  userIdx: index('sessions_user_idx').on(table.userId),
  expiresIdx: index('sessions_expires_idx').on(table.expiresAtMs),
}));

export const transcriptions = sqliteTable('transcriptions', {
  id: text('id').primaryKey(),
  videoId: text('video_id').notNull(),
  beatModel: text('beat_model').notNull(),
  chordModel: text('chord_model').notNull(),
  title: text('title'),
  channelTitle: text('channel_title'),
  thumbnail: text('thumbnail'),
  audioUrl: text('audio_url'),
  keySignature: text('key_signature'),
  bpm: integer('bpm'),
  timeSignature: integer('time_signature'),
  isPrimaryVariant: integer('is_primary_variant', { mode: 'boolean' }).notNull().default(false),
  displayPriority: integer('display_priority'),
  usageCount: integer('usage_count').notNull().default(0),
  payloadJson: text('payload_json').notNull(),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
}, (table) => ({
  videoIdx: index('transcriptions_video_idx').on(table.videoId),
  recentIdx: index('transcriptions_recent_idx').on(table.isPrimaryVariant, table.createdAtMs, table.id),
  variantUnique: uniqueIndex('transcriptions_variant_unique').on(table.videoId, table.beatModel, table.chordModel),
}));

export const transcriptionSearchKeys = sqliteTable('transcription_search_keys', {
  transcriptionId: text('transcription_id').notNull().references(() => transcriptions.id, { onDelete: 'cascade' }),
  searchKey: text('search_key').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.transcriptionId, table.searchKey] }),
  keyIdx: index('transcription_search_key_idx').on(table.searchKey, table.transcriptionId),
}));

function jsonCacheTable(name: string) {
  return sqliteTable(name, {
    key: text('cache_key').primaryKey(),
    videoId: text('video_id'),
    payloadJson: text('payload_json').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
    expiresAtMs: integer('expires_at_ms'),
  });
}

export const melodies = sqliteTable('melodies', {
  videoId: text('video_id').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
  expiresAtMs: integer('expires_at_ms'),
});
export const lyrics = sqliteTable('lyrics', {
  videoId: text('video_id').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
  expiresAtMs: integer('expires_at_ms'),
});
export const translations = jsonCacheTable('translations');
export const keyDetections = jsonCacheTable('key_detections');
export const statusReports = sqliteTable('status_reports', {
  reportDate: text('report_date').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
  expiresAtMs: integer('expires_at_ms'),
});

export const audioFiles = sqliteTable('audio_files', {
  videoId: text('video_id').primaryKey(),
  filename: text('filename').notNull().unique(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type'),
  title: text('title'),
  duration: integer('duration_ms'),
  createdAtMs: integer('created_at_ms').notNull(),
  lastAccessedAtMs: integer('last_accessed_at_ms').notNull(),
  state: text('state').notNull().default('active'),
}, (table) => ({
  lruIdx: index('audio_files_lru_idx').on(table.state, table.lastAccessedAtMs),
}));

export const stemSets = sqliteTable('stem_sets', {
  sourceId: text('source_id').primaryKey(),
  sourceType: text('source_type').notNull(),
  videoId: text('video_id'),
  ownerUserId: text('owner_user_id'),
  title: text('title'),
  inputPath: text('input_path').notNull(),
  status: text('status').notNull().default('pending'),
  model: text('model'),
  stemsJson: text('stems_json'),
  durationMs: integer('duration_ms'),
  totalBytes: integer('total_bytes').notNull().default(0),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
  lastAccessedAtMs: integer('last_accessed_at_ms').notNull(),
}, (table) => ({
  lruIdx: index('stem_sets_lru_idx').on(table.status, table.lastAccessedAtMs),
  ownerIdx: index('stem_sets_owner_idx').on(table.ownerUserId, table.updatedAtMs),
}));

export const stemJobs = sqliteTable('stem_jobs', {
  jobId: text('job_id').primaryKey(),
  sourceId: text('source_id').notNull(),
  status: text('status').notNull(),
  requestedBy: text('requested_by'),
  inputPath: text('input_path').notNull(),
  error: text('error'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAtMs: integer('next_attempt_at_ms').notNull(),
  leaseExpiresAtMs: integer('lease_expires_at_ms'),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
  completedAtMs: integer('completed_at_ms'),
}, (table) => ({
  sourceIdx: index('stem_jobs_source_idx').on(table.sourceId, table.status, table.updatedAtMs),
  queueIdx: index('stem_jobs_queue_idx').on(table.status, table.nextAttemptAtMs, table.leaseExpiresAtMs),
}));

export const maintenanceLocks = sqliteTable('maintenance_locks', {
  name: text('name').primaryKey(),
  owner: text('owner').notNull(),
  expiresAtMs: integer('expires_at_ms').notNull(),
});

export const anonymousQuotas = sqliteTable('anonymous_quotas', {
  id: text('id').primaryKey(), // anon_token (UUIDv4)
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  usedCount: integer('used_count').notNull().default(0),
  trialVideoId: text('trial_video_id'),
  firstUsedAtMs: integer('first_used_at_ms'),
  lastUsedAtMs: integer('last_used_at_ms'),
  createdAtMs: integer('created_at_ms').notNull(),
}, (table) => ({
  ipIdx: index('anonymous_quotas_ip_idx').on(table.ipAddress),
}));

