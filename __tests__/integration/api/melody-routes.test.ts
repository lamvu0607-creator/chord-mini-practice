import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import { MessageChannel, MessagePort } from 'node:worker_threads';
import type { NextRequest } from 'next/server';

Object.assign(globalThis, { MessageChannel, MessagePort, ReadableStream, TextDecoder, TextEncoder, TransformStream, WritableStream });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FormData, Headers, Request, Response } = require('undici');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { File } = require('node:buffer');
Object.assign(globalThis, { File, FormData, Headers, Request, Response });

type TestUser = { userId: string; role: 'admin' | 'member' } | null;
let currentUser: TestUser = null;

jest.mock('@/server/auth/sessionGuard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextResponse } = require('next/server');
  return {
    getAuthenticatedUser: jest.fn(async () => currentUser),
    requireAuth: jest.fn(async () => (currentUser
      ? { user: currentUser }
      : { errorResponse: NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 }) })),
  };
});
jest.mock('@/server/stems/stemWorker', () => ({
  startStemWorker: jest.fn(),
  stemsBackendUrl: () => 'http://stems.test',
}));

const VIDEO_ID = 'dQw4w9WgXcQ';
const UPLOAD_ID = 'upload_abcdef0123456789abcdef01';
const UPLOAD_STEM_ID = 'up_abcdef0123456789abcdef01';
const URL_BASE = 'http://localhost/api/transcribe-sheetsage';

function v2Request(videoId: string) {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ videoId, pipeline: 'v2' }),
  }) as unknown as NextRequest;
}

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

describe('melody v2 API routes', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-melody-route-'));
    process.env.SQLITE_DATABASE_PATH = path.join(root, 'db', 'test.sqlite');
    process.env.LOCAL_AUDIO_STORAGE_DIR = path.join(root, 'audio');
    await mkdir(process.env.LOCAL_AUDIO_STORAGE_DIR, { recursive: true });
    currentUser = null;
    jest.resetModules();
  });

  afterEach(async () => {
    const { closeDatabaseForTests } = await import('@/server/persistence/database');
    closeDatabaseForTests();
    await rm(root, { recursive: true, force: true });
  });

  it('serves a cached v2 melody without sign-in and ignores older mix-based results', async () => {
    const { POST } = await import('@/app/api/transcribe-sheetsage/route');
    const { setDocument } = await import('@/server/persistence/documentService');

    await setDocument('melody', VIDEO_ID, { source: 'sheetsage', noteEvents: [], model: 'basic-pitch@mix' });
    expect((await POST(v2Request(VIDEO_ID))).status).toBe(401);

    await setDocument('melody', VIDEO_ID, { source: 'sheetsage', pipelineVersion: 2, noteEvents: [], instrumentNotes: [] });
    const cached = await POST(v2Request(VIDEO_ID));
    expect(cached.status).toBe(200);
    expect((await cached.json()).data).toMatchObject({ pipelineVersion: 2 });
  });

  it('rejects ids that are neither YouTube songs nor well-formed uploads', async () => {
    const { POST } = await import('@/app/api/transcribe-sheetsage/route');
    const response = await POST(v2Request('upload_0123456789abcdef'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'UNSUPPORTED_SOURCE' });
  });

  it('queues uploads against a private stem set owned by the uploader', async () => {
    currentUser = { userId: 'owner', role: 'member' };
    const { POST } = await import('@/app/api/transcribe-sheetsage/route');
    const storage = await import('@/services/storage/localAudioStorageService');
    const { claimAudioOwner } = await import('@/server/persistence/audioRepository');
    const { canViewStemSet, getStemSet } = await import('@/server/stems/stemSetRepository');

    expect((await POST(v2Request(UPLOAD_ID))).status).toBe(409);

    await storage.saveLocalAudioFile(UPLOAD_ID, new Uint8Array([1, 2, 3]), { filename: 'clip.wav' });
    claimAudioOwner(UPLOAD_ID, 'owner');

    // Another signed-in user with the link triggers the job; the set still belongs to the uploader.
    currentUser = { userId: 'friend', role: 'member' };
    const created = await POST(v2Request(UPLOAD_ID));
    expect(created.status).toBe(202);
    expect((await created.json()).job).toMatchObject({ videoId: UPLOAD_ID, status: 'queued' });

    const stemSet = getStemSet(UPLOAD_STEM_ID)!;
    expect(stemSet).toMatchObject({ sourceType: 'upload', ownerUserId: 'owner', videoId: UPLOAD_ID });
    expect(canViewStemSet(stemSet, null)).toBe(false);
  });

  it('assigns an upload from before owners were stored to the first requester', async () => {
    currentUser = { userId: 'first', role: 'member' };
    const { POST } = await import('@/app/api/transcribe-sheetsage/route');
    const storage = await import('@/services/storage/localAudioStorageService');
    const { findAudioMetadataByVideoId } = await import('@/server/persistence/audioRepository');
    const { getStemSet } = await import('@/server/stems/stemSetRepository');

    await storage.saveLocalAudioFile(UPLOAD_ID, new Uint8Array([1]), { filename: 'old.mp3' });
    expect((await POST(v2Request(UPLOAD_ID))).status).toBe(202);
    expect(findAudioMetadataByVideoId(UPLOAD_ID)?.ownerUserId).toBe('first');
    expect(getStemSet(UPLOAD_STEM_ID)?.ownerUserId).toBe('first');
  });

  it('does not evict stems while a melody job still needs them', async () => {
    const { upsertPendingStemSet, markStemSetReady, listEvictableStemSets } = await import('@/server/stems/stemSetRepository');
    const { createMelodyJob, completeMelodyJob } = await import('@/server/melody/melodyJobService');

    upsertPendingStemSet({ sourceId: UPLOAD_STEM_ID, sourceType: 'upload', ownerUserId: 'u1', inputPath: 'a.wav' });
    markStemSetReady(UPLOAD_STEM_ID, { model: 'scnet', stems: [] });
    expect(listEvictableStemSets().map((set) => set.sourceId)).toEqual([UPLOAD_STEM_ID]);

    const job = createMelodyJob({ videoId: UPLOAD_ID, sourceId: UPLOAD_STEM_ID, inputPath: 'a.wav', requestedBy: 'u1' });
    expect(listEvictableStemSets()).toEqual([]);

    completeMelodyJob(job.jobId);
    expect(listEvictableStemSets().map((set) => set.sourceId)).toEqual([UPLOAD_STEM_ID]);
  });

  it('queues one job per song once the audio is cached and reports it until it completes', async () => {
    currentUser = { userId: 'u1', role: 'member' };
    const { POST } = await import('@/app/api/transcribe-sheetsage/route');
    const { GET } = await import('@/app/api/transcribe-sheetsage/jobs/[jobId]/route');

    const missing = await POST(v2Request(VIDEO_ID));
    expect(missing.status).toBe(409);
    expect(await missing.json()).toMatchObject({ code: 'AUDIO_NOT_CACHED' });

    const storage = await import('@/services/storage/localAudioStorageService');
    await storage.saveLocalAudioFile(VIDEO_ID, new Uint8Array([1, 2, 3]), { filename: 'song.mp3' });

    const created = await POST(v2Request(VIDEO_ID));
    expect(created.status).toBe(202);
    const { job } = await created.json();
    expect(job).toMatchObject({ videoId: VIDEO_ID, status: 'queued', stage: 'queued' });

    const again = await (await POST(v2Request(VIDEO_ID))).json();
    expect(again.job.jobId).toBe(job.jobId);

    const polled = await (await GET(new Request(`${URL_BASE}/jobs/${job.jobId}`) as unknown as NextRequest, params({ jobId: job.jobId }))).json();
    expect(polled).toMatchObject({ success: true, job: { jobId: job.jobId, status: 'queued' }, queuePosition: 0 });

    const jobs = await import('@/server/melody/melodyJobService');
    const { setDocument } = await import('@/server/persistence/documentService');
    await setDocument('melody', VIDEO_ID, { source: 'sheetsage', pipelineVersion: 2, noteEvents: [] });
    jobs.completeMelodyJob(job.jobId);
    const done = await (await GET(new Request(`${URL_BASE}/jobs/${job.jobId}`) as unknown as NextRequest, params({ jobId: job.jobId }))).json();
    expect(done).toMatchObject({ job: { status: 'completed', stage: 'done' }, data: { pipelineVersion: 2 } });

    currentUser = null;
    expect((await GET(new Request(`${URL_BASE}/jobs/${job.jobId}`) as unknown as NextRequest, params({ jobId: job.jobId }))).status).toBe(401);
  });

  it('limits members to two active melody jobs', async () => {
    currentUser = { userId: 'u1', role: 'member' };
    const storage = await import('@/services/storage/localAudioStorageService');
    const { POST } = await import('@/app/api/transcribe-sheetsage/route');
    const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'];
    for (const id of ids) await storage.saveLocalAudioFile(id, new Uint8Array([1]), { filename: `${id}.mp3` });

    const statuses = [];
    for (const id of ids) statuses.push((await POST(v2Request(id))).status);
    expect(statuses).toEqual([202, 202, 429]);
  });
});
