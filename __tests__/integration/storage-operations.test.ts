import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '..', '..');
const migrationPath = path.join(projectRoot, 'drizzle', '0000_local_persistence.sql');

function runScript(script: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', script), ...args], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

async function sha256(filename: string) {
  return createHash('sha256').update(await readFile(filename)).digest('hex');
}

describe('local storage operational scripts', () => {
  jest.setTimeout(30_000);
  let root: string;

  beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'chordmini-ops-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('backs up and restores a consistent SQLite/audio snapshot', async () => {
    const sourceDb = path.join(root, 'source', 'db.sqlite');
    const sourceAudio = path.join(root, 'source', 'audio');
    await mkdir(path.dirname(sourceDb), { recursive: true });
    await mkdir(sourceAudio, { recursive: true });
    const filename = 'audio_[snapshot-video]_1.webm';
    await writeFile(path.join(sourceAudio, filename), Buffer.from('snapshot-audio'));
    const db = new Database(sourceDb);
    db.exec(await readFile(migrationPath, 'utf8'));
    const now = Date.now();
    db.prepare('INSERT INTO schema_migrations VALUES(1,?)').run(now);
    db.prepare("INSERT INTO audio_files VALUES(?,?,?,?,?,?,?,?, 'active')")
      .run('snapshot-video', filename, 14, 'audio/webm', 'Snapshot', null, now, now);
    db.close();

    const backupDir = path.join(root, 'nested', 'backup');
    runScript('backup-local-storage.mjs', [`--output=${backupDir}`], {
      SQLITE_DATABASE_PATH: sourceDb, LOCAL_AUDIO_STORAGE_DIR: sourceAudio,
    });
    const manifest = JSON.parse(await readFile(path.join(backupDir, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ schemaVersion: 1, audio: [{ videoId: 'snapshot-video', filename }] });

    const restoredDb = path.join(root, 'restore', 'db.sqlite');
    const restoredAudio = path.join(root, 'restore', 'audio');
    runScript('restore-local-storage.mjs', [`--from=${backupDir}`, '--app-stopped'], {
      SQLITE_DATABASE_PATH: restoredDb, LOCAL_AUDIO_STORAGE_DIR: restoredAudio,
    });
    const restored = new Database(restoredDb, { readonly: true });
    expect(restored.prepare('SELECT video_id FROM audio_files').pluck().get()).toBe('snapshot-video');
    restored.close();
    expect((await stat(path.join(restoredAudio, filename))).size).toBe(14);
  });

  it('validates an archive in dry-run mode and imports it idempotently', async () => {
    const archive = path.join(root, 'archive');
    const archiveAudio = path.join(archive, 'audio');
    await mkdir(archiveAudio, { recursive: true });
    const filename = 'audio_[archive-video]_1.webm';
    const audioPath = path.join(archiveAudio, filename);
    await writeFile(audioPath, Buffer.from('archive-audio'));
    const records = [{ id: 'archive-video_madmom_chord-cnn-lstm', data: {
      videoId: 'archive-video', beatModel: 'madmom', chordModel: 'chord-cnn-lstm', title: 'Archive',
      audioUrl: 'https://remote.invalid/audio.webm', keySignature: 'Db', beats: [], chords: [], synchronizedChords: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    } }];
    const recordsPath = path.join(archive, 'transcriptions.json');
    await writeFile(recordsPath, JSON.stringify(records));
    await writeFile(path.join(archive, 'manifest.json'), JSON.stringify({
      collections: { transcriptions: { file: 'transcriptions.json', count: 1, sha256: await sha256(recordsPath) } },
      audio: [{ videoId: 'archive-video', filename, size: 13, sha256: await sha256(audioPath), mimeType: 'audio/webm' }],
    }));

    const targetDb = path.join(root, 'target', 'db.sqlite');
    const targetAudio = path.join(root, 'target', 'audio');
    const env = { SQLITE_DATABASE_PATH: targetDb, LOCAL_AUDIO_STORAGE_DIR: targetAudio };
    expect(runScript('import-local-archive.mjs', [`--from=${archive}`, '--dry-run'], env)).toContain('Validated 1 records');
    runScript('import-local-archive.mjs', [`--from=${archive}`, '--app-stopped'], env);
    runScript('import-local-archive.mjs', [`--from=${archive}`, '--app-stopped'], env);

    const imported = new Database(targetDb, { readonly: true });
    const row = imported.prepare('SELECT audio_url, is_primary_variant FROM transcriptions').get() as { audio_url: string; is_primary_variant: number };
    expect(row).toEqual({ audio_url: `/api/serve-local-audio?filename=${encodeURIComponent(filename)}`, is_primary_variant: 1 });
    expect(imported.prepare('SELECT search_key FROM transcription_search_keys ORDER BY search_key').pluck().all()).toEqual(['c#', 'db']);
    imported.close();
  });
});
