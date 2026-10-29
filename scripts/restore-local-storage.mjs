import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const sourceArg = process.argv.find((arg) => arg.startsWith('--from='))?.slice(7);
if (!sourceArg || !process.argv.includes('--app-stopped')) {
  throw new Error('Usage: npm run storage:restore -- --from=<backup-dir> --app-stopped');
}
const sourceDir = path.resolve(sourceArg);
const databasePath = path.resolve(process.env.SQLITE_DATABASE_PATH || 'storage/db/chordmini.sqlite');
const audioDir = path.resolve(process.env.LOCAL_AUDIO_STORAGE_DIR || 'storage/audio');
const manifest = JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));

async function sha256(filename) {
  return createHash('sha256').update(await readFile(filename)).digest('hex');
}
async function assertChecksum(filename, expected) {
  if (await sha256(filename) !== expected) throw new Error(`Checksum mismatch: ${filename}`);
}

const sourceDatabase = path.join(sourceDir, manifest.database.filename);
await assertChecksum(sourceDatabase, manifest.database.sha256);
const snapshot = new Database(sourceDatabase, { readonly: true, fileMustExist: true });
const schemaVersion = snapshot.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version;
snapshot.close();
if (schemaVersion !== manifest.schemaVersion || schemaVersion < 1) throw new Error('Unsupported or inconsistent schema version');
for (const entry of manifest.audio) {
  const filename = path.basename(entry.filename);
  if (filename !== entry.filename) throw new Error(`Unsafe audio filename: ${entry.filename}`);
  const source = path.join(sourceDir, 'audio', filename);
  if ((await stat(source)).size !== entry.size) throw new Error(`Audio size mismatch: ${filename}`);
  await assertChecksum(source, entry.sha256);
}

const suffix = `.restore-${Date.now()}`;
const stagedDb = `${databasePath}.incoming${suffix}`;
const stagedAudio = `${audioDir}.incoming${suffix}`;
await mkdir(path.dirname(databasePath), { recursive: true });
await mkdir(stagedAudio, { recursive: false });
await copyFile(sourceDatabase, stagedDb);
for (const entry of manifest.audio) {
  await copyFile(path.join(sourceDir, 'audio', entry.filename), path.join(stagedAudio, entry.filename));
}

const oldDb = `${databasePath}.previous${suffix}`;
const oldAudio = `${audioDir}.previous${suffix}`;
let hadDatabase = true;
let hadAudio = true;
try { await access(databasePath); } catch { hadDatabase = false; }
try { await access(audioDir); } catch { hadAudio = false; }
if (hadDatabase) await rename(databasePath, oldDb);
if (hadAudio) await rename(audioDir, oldAudio);
try {
  await rename(stagedDb, databasePath);
  await rename(stagedAudio, audioDir);
} catch (error) {
  await rm(databasePath, { force: true });
  await rm(audioDir, { recursive: true, force: true });
  if (hadDatabase) await rename(oldDb, databasePath);
  if (hadAudio) await rename(oldAudio, audioDir);
  throw error;
}
console.log(`Restore complete. Previous data retained at ${oldDb} and ${oldAudio}`);
