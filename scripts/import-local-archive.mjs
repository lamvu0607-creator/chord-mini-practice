import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const sourceArg = process.argv.find((arg) => arg.startsWith('--from='))?.slice(7);
const dryRun = process.argv.includes('--dry-run');
if (!sourceArg || (!dryRun && !process.argv.includes('--app-stopped'))) {
  throw new Error('Usage: npm run storage:import -- --from=<archive-dir> [--dry-run | --app-stopped]');
}
const sourceDir = path.resolve(sourceArg);
const databasePath = path.resolve(process.env.SQLITE_DATABASE_PATH || 'storage/db/chordmini.sqlite');
const audioDir = path.resolve(process.env.LOCAL_AUDIO_STORAGE_DIR || 'storage/audio');
const manifest = JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
const migrationSql = await readFile(path.resolve('drizzle/0000_local_persistence.sql'), 'utf8');

async function checksum(filename) {
  return createHash('sha256').update(await readFile(filename)).digest('hex');
}
async function exists(filename) { try { await access(filename); return true; } catch { return false; } }

const collections = {};
for (const [name, descriptor] of Object.entries(manifest.collections || {})) {
  const filename = path.join(sourceDir, path.basename(descriptor.file));
  if (await checksum(filename) !== descriptor.sha256) throw new Error(`Collection checksum mismatch: ${name}`);
  const records = JSON.parse(await readFile(filename, 'utf8'));
  if (!Array.isArray(records) || records.length !== descriptor.count) throw new Error(`Collection count mismatch: ${name}`);
  collections[name] = records;
}

const audioByVideo = new Map();
for (const entry of manifest.audio || []) {
  const filename = path.basename(entry.filename);
  if (filename !== entry.filename) throw new Error(`Unsafe audio filename: ${entry.filename}`);
  const source = path.join(sourceDir, 'audio', filename);
  const info = await stat(source);
  if (!info.isFile() || info.size !== entry.size || await checksum(source) !== entry.sha256) {
    throw new Error(`Audio validation failed: ${filename}`);
  }
  if (audioByVideo.has(entry.videoId)) throw new Error(`Duplicate audio for video: ${entry.videoId}`);
  audioByVideo.set(entry.videoId, entry);
}

function localAudioUrl(videoId) {
  const entry = audioByVideo.get(videoId);
  if (!entry) throw new Error(`Referenced audio is missing for video: ${videoId}`);
  return `/api/serve-local-audio?filename=${encodeURIComponent(entry.filename)}`;
}
function epochMs(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return epochMs(numeric, fallback);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value && typeof value === 'object') {
    const seconds = Number(value.seconds ?? value._seconds);
    const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
    if (Number.isFinite(seconds)) return Math.round(seconds * 1000 + nanoseconds / 1_000_000);
  }
  return fallback;
}
function normalizeRecord(record) {
  const data = structuredClone(record.data || record);
  const videoId = data.videoId || data.songContext?.videoId || record.videoId;
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'audioUrl' || key === 'audio_url') && typeof child === 'string' && /^https?:/i.test(child)) {
        value[key] = localAudioUrl(videoId);
      } else visit(child);
    }
  };
  visit(data);
  const serialized = JSON.stringify(data);
  if (/"(?:audioUrl|audio_url)"\s*:\s*"https?:/i.test(serialized)) {
    throw new Error(`Remote audio URL remains in record ${record.id || videoId || 'unknown'}`);
  }
  return data;
}

for (const records of Object.values(collections)) records.forEach(normalizeRecord);
console.log(`Validated ${Object.values(collections).reduce((sum, records) => sum + records.length, 0)} records and ${audioByVideo.size} audio files`);
if (dryRun) process.exit(0);

await mkdir(path.dirname(databasePath), { recursive: true });
await mkdir(audioDir, { recursive: true });
const staged = [];
for (const entry of audioByVideo.values()) {
  const destination = path.join(audioDir, entry.filename);
  if (await exists(destination)) {
    if (await checksum(destination) !== entry.sha256) throw new Error(`Audio destination conflict: ${entry.filename}`);
    continue;
  }
  const temporary = path.join(audioDir, `.${entry.filename}.import-${process.pid}`);
  await copyFile(path.join(sourceDir, 'audio', entry.filename), temporary);
  staged.push({ temporary, destination });
}

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(migrationSql);
const moved = [];
// Move validated files before the transaction. They use unique names and are
// removed if any database write fails, giving the import all-or-nothing behavior.
for (const file of staged) { await rename(file.temporary, file.destination); moved.push(file.destination); }
try {
  db.transaction(() => {
    const now = Date.now();
    const putDocument = (table, keyColumn, key, data) => db.prepare(`INSERT INTO ${table}(${keyColumn},payload_json,created_at_ms,updated_at_ms,expires_at_ms) VALUES(?,?,?,?,?) ON CONFLICT(${keyColumn}) DO UPDATE SET payload_json=excluded.payload_json,updated_at_ms=excluded.updated_at_ms,expires_at_ms=excluded.expires_at_ms`)
      .run(key, JSON.stringify(data), epochMs(data.createdAtMs ?? data.createdAt, now), now,
        data.expiresAtMs == null ? null : epochMs(data.expiresAtMs, null));

    const importedVideoIds = new Set();
    for (const record of collections.transcriptions || []) {
      const data = normalizeRecord(record); const id = record.id || `${data.videoId}_${data.beatModel}_${data.chordModel}`;
      if (!data.videoId || !data.beatModel || !data.chordModel) throw new Error(`Invalid transcription identity: ${id}`);
      importedVideoIds.add(data.videoId);
      db.prepare(`INSERT INTO transcriptions(id,video_id,beat_model,chord_model,title,channel_title,thumbnail,audio_url,key_signature,bpm,time_signature,is_primary_variant,display_priority,usage_count,payload_json,created_at_ms,updated_at_ms)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,title=excluded.title,channel_title=excluded.channel_title,thumbnail=excluded.thumbnail,audio_url=excluded.audio_url,key_signature=excluded.key_signature,bpm=excluded.bpm,time_signature=excluded.time_signature,is_primary_variant=excluded.is_primary_variant,display_priority=excluded.display_priority,usage_count=excluded.usage_count,updated_at_ms=excluded.updated_at_ms`)
        .run(id, data.videoId, data.beatModel, data.chordModel, data.title || null, data.channelTitle || null, data.thumbnail || null,
          data.audioUrl || null, data.keySignature || data.primaryKey || null, data.bpm || null, data.timeSignature || null,
          data.isPrimaryVariant ? 1 : 0, data.displayPriority || null, data.usageCount || 0, JSON.stringify(data),
          epochMs(data.createdAtMs ?? data.createdAt, now), now);
      db.prepare('DELETE FROM transcription_search_keys WHERE transcription_id=?').run(id);
      for (const key of data.searchableKeys || []) db.prepare('INSERT OR IGNORE INTO transcription_search_keys VALUES(?,?)').run(id, key);
    }
    const generic = [
      ['melody', 'melodies', 'video_id'], ['lyrics', 'lyrics', 'video_id'],
      ['translations', 'translations', 'cache_key'], ['keyDetections', 'key_detections', 'cache_key'],
      ['statusReports', 'status_reports', 'report_date'],
    ];
    for (const [collection, table, keyColumn] of generic) {
      const records = collection === 'melody'
        ? [...(collections.melody || []), ...(collections.melodies || [])]
        : (collections[collection] || []);
      for (const record of records) {
        const data = normalizeRecord(record); putDocument(table, keyColumn, record.id || data.videoId || data.date, data);
      }
    }
    for (const record of collections.segmentationJobs || []) {
      const data = normalizeRecord(record); const jobId = record.id || data.jobId;
      const status = data.status === 'completed' || data.status === 'failed' ? data.status : 'queued';
      const audioUrl = data.audioUrl || data.audio_url;
      if (!jobId || !audioUrl) throw new Error(`Invalid segmentation job: ${jobId || 'unknown'}`);
      db.prepare(`INSERT INTO segmentation_jobs(job_id,request_hash,status,title,video_id,upload_id,audio_url,song_context_json,result_json,error,model,attempt_count,next_attempt_at_ms,lease_expires_at_ms,created_at_ms,updated_at_ms,completed_at_ms)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,result_json=excluded.result_json,error=excluded.error,model=excluded.model,attempt_count=excluded.attempt_count,next_attempt_at_ms=excluded.next_attempt_at_ms,lease_expires_at_ms=excluded.lease_expires_at_ms,updated_at_ms=excluded.updated_at_ms,completed_at_ms=excluded.completed_at_ms`)
        .run(jobId, data.requestHash || createHash('sha256').update(JSON.stringify({ videoId: data.videoId, audioUrl })).digest('hex'),
          status, data.title || null, data.videoId || null, data.uploadId || null, audioUrl,
          JSON.stringify(data.songContext || {}), data.result ? JSON.stringify(data.result) : null, data.error || null,
          data.model || null, data.attemptCount || 0, epochMs(data.nextAttemptAtMs, now), null,
          epochMs(data.createdAtMs ?? data.createdAt, now), epochMs(data.updatedAtMs ?? data.updatedAt, now),
          data.completedAtMs == null ? null : epochMs(data.completedAtMs, null));
    }
    for (const entry of audioByVideo.values()) {
      db.prepare(`INSERT INTO audio_files(video_id,filename,file_size,mime_type,title,duration_ms,created_at_ms,last_accessed_at_ms,state) VALUES(?,?,?,?,?,?,?,?, 'active')
        ON CONFLICT(video_id) DO UPDATE SET filename=excluded.filename,file_size=excluded.file_size,mime_type=excluded.mime_type,last_accessed_at_ms=excluded.last_accessed_at_ms,state='active'`)
        .run(entry.videoId, entry.filename, entry.size, entry.mimeType || null, entry.title || null,
          entry.duration == null ? null : Math.round(entry.duration * 1000), epochMs(entry.createdAtMs, now), now);
    }

    // Recompute ranking and enharmonic search keys instead of trusting legacy
    // flags, which may contain multiple "primary" variants for one video.
    const pitchVariants = {
      C: ['c', 'b#'], 'C#': ['c#', 'db'], Db: ['db', 'c#'], D: ['d'], 'D#': ['d#', 'eb'], Eb: ['eb', 'd#'],
      E: ['e', 'fb'], Fb: ['fb', 'e'], F: ['f', 'e#'], 'F#': ['f#', 'gb'], Gb: ['gb', 'f#'], G: ['g'],
      'G#': ['g#', 'ab'], Ab: ['ab', 'g#'], A: ['a'], 'A#': ['a#', 'bb'], Bb: ['bb', 'a#'], B: ['b', 'cb'], Cb: ['cb', 'b'],
    };
    const score = (row) => ({ madmom: 0, 'beat-transformer': 1 }[row.beat_model] ?? 99) * 100
      + ({ 'chord-cnn-lstm': 0, 'btc-sl': 1, 'btc-pl': 2 }[row.chord_model] ?? 99);
    for (const videoId of importedVideoIds) {
      const rows = db.prepare('SELECT * FROM transcriptions WHERE video_id=?').all(videoId)
        .sort((left, right) => score(left) - score(right) || right.created_at_ms - left.created_at_ms || left.id.localeCompare(right.id));
      rows.forEach((row, index) => {
        const payload = JSON.parse(row.payload_json);
        const key = String(payload.keySignature || payload.primaryKey || '').trim();
        const match = /^([A-G](?:#|b)?)(?:\s+(major|minor)|m)?$/i.exec(key);
        const quality = match?.[2]?.toLowerCase() || (/m$/i.test(key) ? 'minor' : '');
        const roots = match ? (pitchVariants[match[1][0].toUpperCase() + match[1].slice(1)] || [match[1].toLowerCase()]) : (key ? [key.toLowerCase()] : []);
        payload.isPrimaryVariant = index === 0;
        payload.displayPriority = index + 1;
        payload.searchableKeys = [...new Set(roots.map((root) => quality ? `${root} ${quality}` : root))];
        db.prepare('UPDATE transcriptions SET is_primary_variant=?,display_priority=?,payload_json=?,updated_at_ms=? WHERE id=?')
          .run(index === 0 ? 1 : 0, index + 1, JSON.stringify(payload), now, row.id);
        db.prepare('DELETE FROM transcription_search_keys WHERE transcription_id=?').run(row.id);
        for (const keyValue of payload.searchableKeys) {
          db.prepare('INSERT OR IGNORE INTO transcription_search_keys(transcription_id,search_key) VALUES(?,?)').run(row.id, keyValue);
        }
      });
    }
    db.prepare('INSERT OR IGNORE INTO schema_migrations(version,applied_at_ms) VALUES(1,?)').run(now);
  })();
} catch (error) {
  for (const filename of moved) await rm(filename, { force: true });
  throw error;
} finally { db.close(); }
console.log('Import completed successfully');
