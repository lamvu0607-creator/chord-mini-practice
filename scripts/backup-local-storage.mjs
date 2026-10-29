import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const databasePath = path.resolve(process.env.SQLITE_DATABASE_PATH || 'storage/db/chordmini.sqlite');
const audioDir = path.resolve(process.env.LOCAL_AUDIO_STORAGE_DIR || 'storage/audio');
const requestedOutput = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve(requestedOutput || `storage/backups/chordmini-${stamp}`);
const owner = `backup-${randomUUID()}`;

async function sha256(filename) {
  return createHash('sha256').update(await readFile(filename)).digest('hex');
}

await mkdir(path.dirname(outputDir), { recursive: true });
await mkdir(outputDir, { recursive: false });
await mkdir(path.join(outputDir, 'audio'));
const database = new Database(databasePath);
database.pragma('busy_timeout = 5000');

try {
  const now = Date.now();
  const acquired = database.transaction(() => {
    database.prepare("DELETE FROM maintenance_locks WHERE name='audio-maintenance' AND expires_at_ms <= ?").run(now);
    return database.prepare("INSERT OR IGNORE INTO maintenance_locks(name, owner, expires_at_ms) VALUES ('audio-maintenance', ?, ?)")
      .run(owner, now + 60 * 60_000).changes === 1;
  })();
  if (!acquired) throw new Error('Audio maintenance is already running');

  const snapshotPath = path.join(outputDir, 'chordmini.sqlite');
  await database.backup(snapshotPath);
  const rows = database.prepare("SELECT video_id, filename, file_size FROM audio_files WHERE state='active' ORDER BY filename").all();
  const audio = [];
  for (const row of rows) {
    const source = path.join(audioDir, path.basename(row.filename));
    const destination = path.join(outputDir, 'audio', path.basename(row.filename));
    const info = await stat(source);
    if (!info.isFile() || info.size !== row.file_size) throw new Error(`Audio validation failed: ${row.filename}`);
    await copyFile(source, destination);
    audio.push({ videoId: row.video_id, filename: row.filename, size: info.size, sha256: await sha256(destination) });
  }

  const snapshot = new Database(snapshotPath, { readonly: true });
  const schemaVersion = snapshot.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version;
  snapshot.close();
  const manifest = {
    formatVersion: 1,
    schemaVersion,
    createdAtMs: Date.now(),
    database: { filename: 'chordmini.sqlite', size: (await stat(snapshotPath)).size, sha256: await sha256(snapshotPath) },
    audio,
  };
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Backup created at ${outputDir} (${audio.length} audio files)`);
} finally {
  database.prepare("DELETE FROM maintenance_locks WHERE name='audio-maintenance' AND owner=?").run(owner);
  database.close();
}
