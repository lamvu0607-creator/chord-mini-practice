import { mkdir, mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('stem jobs and stem set storage', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-stems-'));
    process.env.SQLITE_DATABASE_PATH = path.join(root, 'db', 'test.sqlite');
    process.env.LOCAL_AUDIO_STORAGE_DIR = path.join(root, 'audio');
    await mkdir(process.env.LOCAL_AUDIO_STORAGE_DIR, { recursive: true });
    jest.resetModules();
  });

  afterEach(async () => {
    const { closeDatabaseForTests } = await import('@/server/persistence/database');
    closeDatabaseForTests();
    delete process.env.STEMS_QUOTA_GB;
    delete process.env.LOCAL_AUDIO_QUOTA_GB;
    await rm(root, { recursive: true, force: true });
  });

  it('claims a queued job only once and reclaims it after the lease expires', async () => {
    const jobs = await import('@/server/stems/stemJobService');
    const { getDatabase } = await import('@/server/persistence/database');
    const created = jobs.createStemJob({ sourceId: 'yt_aaaaaaaaaaa', inputPath: 'a.mp3', requestedBy: 'u1' });

    const claims = [jobs.claimNextStemJob(30_000), jobs.claimNextStemJob(30_000)];
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims[0]).toMatchObject({ jobId: created.jobId, status: 'processing', attemptCount: 1 });
    expect(jobs.countActiveStemJobsForUser('u1')).toBe(1);

    getDatabase().sqlite.prepare('UPDATE stem_jobs SET lease_expires_at_ms=0 WHERE job_id=?').run(created.jobId);
    expect(jobs.claimNextStemJob(30_000)).toMatchObject({ jobId: created.jobId, attemptCount: 2 });
  });

  it('retries transient failures and fails permanent ones immediately', async () => {
    const jobs = await import('@/server/stems/stemJobService');
    const transient = jobs.createStemJob({ sourceId: 'yt_bbbbbbbbbbb', inputPath: 'b.mp3' });
    jobs.retryOrFailStemJob(jobs.claimNextStemJob(30_000)!, 'timeout', 2);
    expect(jobs.getStemJob(transient.jobId)).toMatchObject({ status: 'queued', error: 'timeout' });

    const permanent = jobs.createStemJob({ sourceId: 'yt_ccccccccccc', inputPath: 'c.mp3' });
    const claimed = jobs.claimNextStemJob(30_000)!;
    expect(claimed.jobId).toBe(permanent.jobId);
    jobs.retryOrFailStemJob(claimed, 'missing weights', 2, true);
    expect(jobs.getStemJob(permanent.jobId)).toMatchObject({ status: 'failed', error: 'missing weights' });
    expect(jobs.findActiveStemJob('yt_ccccccccccc')).toBeNull();
  });

  it('shows YouTube sets to everyone but uploads only to their owner or an admin', async () => {
    const sets = await import('@/server/stems/stemSetRepository');
    const owner = { userId: 'owner', role: 'member' } as never;
    const other = { userId: 'other', role: 'member' } as never;
    const admin = { userId: 'root', role: 'admin' } as never;

    const yt = sets.upsertPendingStemSet({ sourceId: 'yt_ddddddddddd', sourceType: 'youtube', videoId: 'ddddddddddd', inputPath: 'd.mp3' });
    const up = sets.upsertPendingStemSet({ sourceId: 'up_0123456789abcdef01234567', sourceType: 'upload', ownerUserId: 'owner', inputPath: 'stems/x/source.mp3' });
    expect(sets.canViewStemSet(yt, null)).toBe(true);
    expect(sets.canViewStemSet(up, null)).toBe(false);
    expect(sets.canViewStemSet(up, other)).toBe(false);
    expect(sets.canViewStemSet(up, owner)).toBe(true);
    expect(sets.canViewStemSet(up, admin)).toBe(true);
    expect(sets.canDeleteStemSet(yt, owner)).toBe(false);
    expect(sets.canDeleteStemSet(up, owner)).toBe(true);

    for (const record of [yt, up]) {
      sets.markStemSetReady(record.sourceId, { model: 'scnet_xl_ihf', stems: [{ name: 'vocals', file: 'vocals.flac', bytes: 10 }] });
    }
    expect(sets.listVisibleStemSets(other).map((record) => record.sourceId)).toEqual(['yt_ddddddddddd']);
    expect(sets.listVisibleStemSets(owner)).toHaveLength(2);
    expect(sets.toPublicStemSet(sets.getStemSet('yt_ddddddddddd')!, null).stems[0].url).toBe('/api/stems/yt_ddddddddddd/vocals');
  });

  it('evicts least recently used stem sets above the quota but keeps the newest one', async () => {
    const sets = await import('@/server/stems/stemSetRepository');
    const storage = await import('@/server/stems/stemStorage');
    const { enforceStemQuota } = await import('@/server/stems/stemWorker');
    const { getDatabase } = await import('@/server/persistence/database');

    for (const [index, sourceId] of ['yt_eeeeeeeeeee', 'yt_fffffffffff'].entries()) {
      sets.upsertPendingStemSet({ sourceId, sourceType: 'youtube', inputPath: 'x.mp3' });
      await mkdir(await storage.absoluteStemDir(sourceId), { recursive: true });
      await writeFile(path.join(await storage.absoluteStemDir(sourceId), 'vocals.flac'), 'x');
      sets.markStemSetReady(sourceId, { model: 'm', stems: [{ name: 'vocals', file: 'vocals.flac', bytes: 600 }] });
      getDatabase().sqlite.prepare('UPDATE stem_sets SET last_accessed_at_ms=? WHERE source_id=?').run(index + 1, sourceId);
    }

    process.env.STEMS_QUOTA_GB = String(1000 / 1024 ** 3);
    expect(await enforceStemQuota('yt_fffffffffff')).toBe(1);
    expect(sets.getStemSet('yt_eeeeeeeeeee')).toBeNull();
    expect(sets.getStemSet('yt_fffffffffff')).not.toBeNull();
    await expect(access(await storage.absoluteStemDir('yt_eeeeeeeeeee'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps source audio of queued stem jobs out of the audio LRU cleanup', async () => {
    const storage = await import('@/services/storage/localAudioStorageService');
    const jobs = await import('@/server/stems/stemJobService');
    const kept = await storage.saveLocalAudioFile('ggggggggggg', new Uint8Array([1, 2, 3, 4]), { filename: 'kept.webm' });
    const dropped = await storage.saveLocalAudioFile('hhhhhhhhhhh', new Uint8Array([5, 6, 7, 8]), { filename: 'dropped.webm' });
    jobs.createStemJob({ sourceId: 'yt_ggggggggggg', inputPath: path.basename(kept.filePath) });

    process.env.LOCAL_AUDIO_QUOTA_GB = String(4 / 1024 ** 3);
    await storage.enforceLocalAudioQuota();

    await expect(access(kept.filePath)).resolves.toBeUndefined();
    await expect(access(dropped.filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects malformed ids and file names that escape the set directory', async () => {
    const storage = await import('@/server/stems/stemStorage');
    expect(storage.isValidSourceId('yt_dQw4w9WgXcQ')).toBe(true);
    expect(storage.isValidSourceId('yt_../../etc')).toBe(false);
    expect(storage.isValidSourceId(storage.uploadSourceId('user', 'abc'))).toBe(true);
    expect(storage.isValidStemName('vocals')).toBe(true);
    expect(storage.isValidStemName('../vocals')).toBe(false);
    await expect(storage.resolveStemFile('yt_dQw4w9WgXcQ', '../other.flac')).rejects.toThrow('Invalid stem file');
    expect(await storage.toAudioRootRelative(path.join(root, 'audio', 'a.mp3'))).toBe('a.mp3');
    expect(await storage.toAudioRootRelative(path.join(root, 'elsewhere.mp3'))).toBeNull();
  });
});
