import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

type FetchCall = { url: string; body: Record<string, unknown> | null };

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe('melody v2 jobs and pipeline', () => {
  let root: string;
  let calls: FetchCall[];
  const originalFetch = global.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-melody-'));
    process.env.SQLITE_DATABASE_PATH = path.join(root, 'db', 'test.sqlite');
    process.env.LOCAL_AUDIO_STORAGE_DIR = path.join(root, 'audio');
    process.env.SHEETSAGE_API_URL = 'http://localhost:8082';
    process.env.MUSCRIPTOR_API_URL = 'http://localhost:8084';
    await mkdir(process.env.LOCAL_AUDIO_STORAGE_DIR, { recursive: true });
    calls = [];
    jest.resetModules();
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    const { closeDatabaseForTests } = await import('@/server/persistence/database');
    closeDatabaseForTests();
    await rm(root, { recursive: true, force: true });
  });

  function mockServices(responses: Record<string, (body: Record<string, unknown> | null) => Response>) {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ url, body });
      const handler = Object.entries(responses).find(([suffix]) => url.endsWith(suffix))?.[1];
      return handler ? handler(body) : jsonResponse(404, {});
    }) as unknown as typeof fetch;
  }

  it('claims a queued job once and keeps the attempt count while it waits for stems', async () => {
    const jobs = await import('@/server/melody/melodyJobService');
    const created = jobs.createMelodyJob({ videoId: 'aaaaaaaaaaa', sourceId: 'yt_aaaaaaaaaaa', inputPath: 'a.mp3', requestedBy: 'u1' });

    const claims = [jobs.claimNextMelodyJob(30_000), jobs.claimNextMelodyJob(30_000)];
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(jobs.countActiveMelodyJobsForUser('u1')).toBe(1);

    jobs.deferMelodyJobForStems(claims[0]!, 'stem_1', 0);
    const deferred = jobs.getMelodyJob(created.jobId)!;
    expect(deferred).toMatchObject({ status: 'queued', stage: 'waiting_stems', stemJobId: 'stem_1', attemptCount: 0 });
    expect(jobs.findActiveMelodyJob('aaaaaaaaaaa')?.jobId).toBe(created.jobId);
  });

  it('queues a stem separation first, then transcribes the vocals stem and the mix', async () => {
    const jobs = await import('@/server/melody/melodyJobService');
    const stemJobs = await import('@/server/stems/stemJobService');
    const sets = await import('@/server/stems/stemSetRepository');
    const { runGpuWorkerTick } = await import('@/server/gpu/gpuWorker');
    const { getDocument } = await import('@/server/persistence/documentService');

    mockServices({
      '/separate': () => jsonResponse(200, {
        success: true,
        data: { model: 'scnet_xl_ihf', stems: [{ name: 'vocals', file: 'vocals.flac', bytes: 10 }] },
      }),
      '/transcribe': (body) => (body && 'mixPath' in body
        ? jsonResponse(200, {
          success: true,
          data: {
            source: 'sheetsage', engine: 'basic-pitch', input: 'stem:vocals', usedJukebox: false,
            noteEvents: [{ onset: 1, offset: 1.5, pitch: 64, velocity: 90 }], noteEventCount: 1,
            beatTimes: [0.5, 1], beatsPerMeasure: 4, tempoBpm: 120,
          },
        })
        : jsonResponse(200, {
          success: true,
          data: { model: 'muscriptor-medium@f322369', notes: [
            { onset: 2, offset: 2.4, pitch: 67, instrument: 'distorted_electric_guitar' },
            { onset: 2, offset: 3, pitch: 40, instrument: 'electric_bass' },
          ] },
        })),
    });

    const job = jobs.createMelodyJob({ videoId: 'bbbbbbbbbbb', sourceId: 'yt_bbbbbbbbbbb', inputPath: 'song.mp3', requestedBy: 'u1' });

    // 1st tick: no stems yet → a stem job is created and the melody job waits for it.
    expect(await runGpuWorkerTick()).toBe('melody');
    const waiting = jobs.getMelodyJob(job.jobId)!;
    expect(waiting.stage).toBe('waiting_stems');
    const stemJob = stemJobs.findActiveStemJob('yt_bbbbbbbbbbb');
    expect(stemJob).toMatchObject({ inputPath: 'song.mp3', requestedBy: 'u1' });

    // 2nd tick: the stem job goes first even though the melody job is older.
    expect(await runGpuWorkerTick()).toBe('stem');
    expect(sets.getStemSet('yt_bbbbbbbbbbb')?.status).toBe('ready');

    // 3rd tick: vocals stem → Sheet Sage, mix → MuScriptor, result cached as v2.
    const { getDatabase } = await import('@/server/persistence/database');
    getDatabase().sqlite.prepare('UPDATE melody_jobs SET next_attempt_at_ms=0 WHERE job_id=?').run(job.jobId);
    expect(await runGpuWorkerTick()).toBe('melody');
    expect(jobs.getMelodyJob(job.jobId)).toMatchObject({ status: 'completed', stage: 'done' });

    const transcribeCalls = calls.filter((call) => call.url.endsWith('/transcribe'));
    expect(transcribeCalls.map((call) => call.body)).toEqual([
      { inputPath: 'stems/yt_bbbbbbbbbbb/vocals.flac', mixPath: 'song.mp3' },
      { jobId: job.jobId, inputPath: 'song.mp3' },
    ]);

    const cached = await getDocument<Record<string, unknown>>('melody', 'bbbbbbbbbbb');
    expect(cached).toMatchObject({
      pipelineVersion: 2,
      vocalInput: 'stem:vocals',
      engines: { vocal: 'basic-pitch@scnet-vocals', instruments: 'muscriptor-medium@f322369' },
      model: 'basic-pitch@scnet-vocals+muscriptor-medium@f322369',
      noteEventCount: 1,
      instrumentNotes: [
        { onset: 2, offset: 2.4, pitch: 67, velocity: 80, instrument: 'distorted_electric_guitar', group: 'guitar' },
        { onset: 2, offset: 3, pitch: 40, velocity: 80, instrument: 'electric_bass', group: 'bass' },
      ],
    });
  });

  it('fails the melody job when its stem separation failed', async () => {
    const jobs = await import('@/server/melody/melodyJobService');
    const stemJobs = await import('@/server/stems/stemJobService');
    const { processMelodyJob } = await import('@/server/melody/melodyPipeline');
    mockServices({});

    const stemJob = stemJobs.createStemJob({ sourceId: 'yt_ccccccccccc', inputPath: 'c.mp3' });
    stemJobs.retryOrFailStemJob(stemJob, 'GPU out of memory', 2, true);
    const job = jobs.createMelodyJob({ videoId: 'ccccccccccc', sourceId: 'yt_ccccccccccc', inputPath: 'c.mp3' });
    jobs.deferMelodyJobForStems(jobs.claimNextMelodyJob(30_000)!, stemJob.jobId, 0);

    await processMelodyJob(jobs.claimNextMelodyJob(30_000)!);
    expect(jobs.getMelodyJob(job.jobId)).toMatchObject({ status: 'failed', error: 'Stem separation failed: GPU out of memory' });
    expect(calls).toHaveLength(0);
  });

  it('does not retry when MuScriptor weights are missing (503)', async () => {
    const jobs = await import('@/server/melody/melodyJobService');
    const sets = await import('@/server/stems/stemSetRepository');
    const { processMelodyJob } = await import('@/server/melody/melodyPipeline');
    sets.upsertPendingStemSet({ sourceId: 'yt_ddddddddddd', sourceType: 'youtube', inputPath: 'd.mp3' });
    sets.markStemSetReady('yt_ddddddddddd', { model: 'm', stems: [{ name: 'vocals', file: 'vocals.flac', bytes: 1 }] });
    mockServices({
      '/transcribe': (body) => (body && 'mixPath' in body
        ? jsonResponse(200, { success: true, data: { source: 'sheetsage', noteEvents: [], beatTimes: [], beatsPerMeasure: 4, tempoBpm: 120 } })
        : jsonResponse(503, { success: false, error: 'MuScriptor weights missing' })),
    });

    const job = jobs.createMelodyJob({ videoId: 'ddddddddddd', sourceId: 'yt_ddddddddddd', inputPath: 'd.mp3' });
    await processMelodyJob(jobs.claimNextMelodyJob(30_000)!);
    expect(jobs.getMelodyJob(job.jobId)).toMatchObject({ status: 'failed', error: 'MuScriptor weights missing' });
  });
});
