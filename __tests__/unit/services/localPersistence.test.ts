import { access, mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('local SQLite persistence', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-sqlite-'));
    process.env.SQLITE_DATABASE_PATH = path.join(root, 'db', 'test.sqlite');
    process.env.LOCAL_AUDIO_STORAGE_DIR = path.join(root, 'audio');
    await mkdir(process.env.LOCAL_AUDIO_STORAGE_DIR, { recursive: true });
    jest.resetModules();
  });

  afterEach(async () => {
    const { closeDatabaseForTests } = await import('@/server/persistence/database');
    closeDatabaseForTests();
    delete process.env.LOCAL_AUDIO_QUOTA_GB;
    await rm(root, { recursive: true, force: true });
  });

  function sample(videoId: string, beatModel: string, chordModel: string, createdAt: number, key = 'C#') {
    return {
      videoId, beatModel, chordModel, createdAt, title: `Song ${videoId}`,
      beats: [{ time: 0, strength: 1 }],
      chords: [{ start: 0, end: 1, time: 0, chord: 'C#', confidence: 0.9 }],
      synchronizedChords: [{ chord: 'C#', beatIndex: 0 }], keySignature: key,
    };
  }

  it('migrates on startup and preserves data across a restart', async () => {
    const persistence = await import('@/server/persistence/database');
    const docs = await import('@/server/persistence/jsonDocumentRepository');
    expect(persistence.getDatabaseHealth()).toMatchObject({ ready: true, schemaVersion: 3, journalMode: 'wal' });
    docs.setLocalDocument('lyrics', 'video-one', { lyrics: 'hello', createdAtMs: 10 });
    persistence.closeDatabaseForTests();
    expect(docs.getLocalDocument('lyrics', 'video-one')).toMatchObject({ lyrics: 'hello' });
  });

  it('upserts variants transactionally, ranks the primary and paginates with an opaque cursor', async () => {
    const repository = await import('@/server/persistence/transcriptionRepository');
    repository.upsertTranscription(sample('video-one', 'beat-transformer', 'btc-pl', 1000) as never);
    repository.upsertTranscription(sample('video-one', 'madmom', 'chord-cnn-lstm', 1000) as never);
    repository.upsertTranscription(sample('video-two', 'madmom', 'chord-cnn-lstm', 2000, 'Db') as never);

    const variants = repository.findVideoTranscriptions('video-one');
    expect(variants).toHaveLength(2);
    expect(variants[0]).toMatchObject({ beatModel: 'madmom', chordModel: 'chord-cnn-lstm', isPrimaryVariant: true });

    await Promise.all(Array.from({ length: 8 }, () => repository.incrementUsage('video-one', 'madmom', 'chord-cnn-lstm')));
    expect(repository.findTranscription('video-one', 'madmom', 'chord-cnn-lstm')?.usageCount).toBe(8);

    const first = repository.findRecentTranscriptions({ selectedKey: 'C#', limit: 1 });
    expect(first.videos[0].videoId).toBe('video-two');
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = repository.findRecentTranscriptions({ selectedKey: 'Db', cursor: first.nextCursor, limit: 1 });
    expect(second.videos[0].videoId).toBe('video-one');
    expect(() => repository.findRecentTranscriptions({ selectedKey: 'all', cursor: 'not-a-cursor', limit: 1 }))
      .toThrow('Invalid pagination cursor');
  });

  it('supports CRUD for every JSON document domain', async () => {
    const docs = await import('@/server/persistence/jsonDocumentRepository');
    const collections = ['melody', 'lyrics', 'translations', 'keyDetections', 'statusReports'] as const;
    for (const collection of collections) {
      docs.setLocalDocument(collection, `key-${collection}`, { value: collection, videoId: 'video-one', createdAtMs: 10 });
      expect(docs.getLocalDocument(collection, `key-${collection}`)).toMatchObject({ value: collection });
      expect(docs.listLocalDocuments<{ value: string }>(collection, 1)[0].value).toBe(collection);
      expect(docs.deleteLocalDocuments(collection, [`key-${collection}`])).toBe(1);
      expect(docs.getLocalDocument(collection, `key-${collection}`)).toBeNull();
    }
  });

  it('rolls back failed transactions', async () => {
    const { getDatabase } = await import('@/server/persistence/database');
    const db = getDatabase().sqlite;
    expect(() => db.transaction(() => {
      db.prepare("INSERT INTO lyrics VALUES (?, ?, ?, ?, ?)").run('rolled-back', '{}', 1, 1, null);
      throw new Error('rollback');
    })()).toThrow('rollback');
    expect(db.prepare("SELECT 1 FROM lyrics WHERE video_id='rolled-back'").get()).toBeUndefined();
  });

  it('writes audio atomically, stores MIME metadata and removes a superseded file', async () => {
    const storage = await import('@/services/storage/localAudioStorageService');
    const repository = await import('@/server/persistence/audioRepository');
    const first = await storage.saveLocalAudioFile('video-one', new Uint8Array([1, 2, 3]), {
      filename: 'first.webm', contentType: 'audio/webm',
    });
    expect(repository.findAudioMetadataByVideoId('video-one')).toMatchObject({
      filename: first.filename, fileSize: 3, mimeType: 'audio/webm',
    });

    const second = await storage.saveLocalAudioFile('video-one', new Uint8Array([4, 5]), { filename: 'second.mp3' });
    expect(repository.findAudioMetadataByVideoId('video-one')).toMatchObject({ filename: second.filename, fileSize: 2 });
    await expect(access(first.filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(second.filePath)).resolves.toBeUndefined();
  });

  it('imports the legacy metadata sidecar once', async () => {
    const audioDir = process.env.LOCAL_AUDIO_STORAGE_DIR!;
    const legacyFilename = 'Legacy-[CwIdGHUkFzw].webm';
    const legacyPath = path.join(audioDir, legacyFilename);
    const sidecarPath = path.join(audioDir, 'cache-metadata.json');
    await writeFile(legacyPath, new Uint8Array([1, 2, 3, 4]));
    await writeFile(sidecarPath, JSON.stringify([{ videoId: 'CwIdGHUkFzw', filename: legacyFilename, filePath: legacyPath }]));

    const storage = await import('@/services/storage/localAudioStorageService');
    const repository = await import('@/server/persistence/audioRepository');
    expect(await storage.bootstrapLocalAudioMetadata()).toBe(1);
    expect(repository.findAudioMetadataByVideoId('CwIdGHUkFzw')).toMatchObject({ filename: legacyFilename, fileSize: 4 });
    await expect(access(sidecarPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('safely cleans up temporary audio files and evicts stale/persisted temp files', async () => {
    const storage = await import('@/services/storage/localAudioStorageService');
    const tempDir = await storage.ensureLocalAudioTempDir();
    const tempFile = path.join(tempDir, 'temp-test-[testVideo123].mp3');
    await writeFile(tempFile, new Uint8Array([1, 2, 3]));
    await expect(access(tempFile)).resolves.toBeUndefined();

    // 1. Refuses to delete files outside temp
    const audioDir = process.env.LOCAL_AUDIO_STORAGE_DIR!;
    const safeStorageFile = path.join(audioDir, 'protected.mp3');
    await writeFile(safeStorageFile, new Uint8Array([9, 9]));
    expect(await storage.cleanupTempAudioFile(safeStorageFile)).toBe(false);
    await expect(access(safeStorageFile)).resolves.toBeUndefined();
    await unlink(safeStorageFile);

    // 2. Cleans up file inside temp
    expect(await storage.cleanupTempAudioFile(tempFile)).toBe(true);
    await expect(access(tempFile)).rejects.toMatchObject({ code: 'ENOENT' });

    // 3. Evicts orphaned/already-persisted temp files
    const persistedTemp = path.join(tempDir, 'song-[persistedVid].mp3');
    await writeFile(persistedTemp, new Uint8Array([4, 5, 6]));
    await storage.saveLocalAudioFile('persistedVid', new Uint8Array([4, 5, 6]));
    const result = await storage.cleanupOrphanTempAudioFiles(100);
    expect(result.deletedFiles).toBeGreaterThanOrEqual(1);
    await expect(access(persistedTemp)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

