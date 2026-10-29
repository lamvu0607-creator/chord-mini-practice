import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

/** undici cannot parse multipart bodies under jsdom, so hand the route an already-parsed form. */
function uploadRequest(fileName: string, bytes: Uint8Array) {
  const file = new File([bytes], fileName, { type: 'application/octet-stream' });
  return {
    headers: new Headers({ 'content-length': String(bytes.byteLength) }),
    formData: async () => ({ get: (name: string) => (name === 'file' ? file : null) }),
  } as unknown as NextRequest;
}

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

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function getRequest(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers }) as unknown as NextRequest;
}

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

describe('stems API routes', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-stems-route-'));
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

  it('requires sign-in and cached audio before queueing a YouTube job', async () => {
    const { POST } = await import('@/app/api/stems/jobs/route');

    expect((await POST(jsonRequest('http://localhost/api/stems/jobs', { videoId: VIDEO_ID }))).status).toBe(401);

    currentUser = { userId: 'u1', role: 'member' };
    const missing = await POST(jsonRequest('http://localhost/api/stems/jobs', { videoId: VIDEO_ID }));
    expect(missing.status).toBe(409);
    expect(await missing.json()).toMatchObject({ code: 'AUDIO_NOT_CACHED' });

    const storage = await import('@/services/storage/localAudioStorageService');
    await storage.saveLocalAudioFile(VIDEO_ID, new Uint8Array([1, 2, 3]), { filename: 'song.mp3' });

    const created = await POST(jsonRequest('http://localhost/api/stems/jobs', { videoId: VIDEO_ID }));
    expect(created.status).toBe(202);
    const { job } = await created.json();
    expect(job).toMatchObject({ sourceId: `yt_${VIDEO_ID}`, status: 'queued' });

    // A second request for the same song joins the running job instead of creating another.
    const again = await (await POST(jsonRequest('http://localhost/api/stems/jobs', { videoId: VIDEO_ID }))).json();
    expect(again.job.jobId).toBe(job.jobId);
  });

  it('limits members to two active separations', async () => {
    currentUser = { userId: 'u1', role: 'member' };
    const storage = await import('@/services/storage/localAudioStorageService');
    const { POST } = await import('@/app/api/stems/jobs/route');
    const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'];
    for (const id of ids) await storage.saveLocalAudioFile(id, new Uint8Array([1]), { filename: `${id}.mp3` });

    const statuses = [];
    for (const id of ids) statuses.push((await POST(jsonRequest('http://localhost/api/stems/jobs', { videoId: id }))).status);
    expect(statuses).toEqual([202, 202, 429]);
  });

  it('keeps uploads private to their owner and serves stems with byte ranges', async () => {
    currentUser = { userId: 'owner', role: 'member' };
    const sets = await import('@/server/stems/stemSetRepository');
    const stemStorage = await import('@/server/stems/stemStorage');
    const sourceId = stemStorage.uploadSourceId('owner', 'hash');
    sets.upsertPendingStemSet({ sourceId, sourceType: 'upload', ownerUserId: 'owner', title: 'My song', inputPath: 'x' });
    const directory = await stemStorage.absoluteStemDir(sourceId);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'vocals.flac'), Buffer.from('0123456789'));
    sets.markStemSetReady(sourceId, { model: 'scnet_xl_ihf', stems: [{ name: 'vocals', file: 'vocals.flac', bytes: 10 }] });

    const { GET } = await import('@/app/api/stems/[sourceId]/[stem]/route');
    const url = `http://localhost/api/stems/${sourceId}/vocals`;

    const partial = await GET(getRequest(url, { range: 'bytes=2-5' }), params({ sourceId, stem: 'vocals' }));
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(Buffer.from(await partial.arrayBuffer()).toString()).toBe('2345');

    const download = await GET(getRequest(`${url}?download=1`), params({ sourceId, stem: 'vocals' }));
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(download.headers.get('cache-control')).toContain('private');

    currentUser = { userId: 'intruder', role: 'member' };
    expect((await GET(getRequest(url), params({ sourceId, stem: 'vocals' }))).status).toBe(404);
    const meta = await import('@/app/api/stems/[sourceId]/route');
    expect((await meta.GET(getRequest(`http://localhost/api/stems/${sourceId}`), params({ sourceId }))).status).toBe(404);
    expect((await GET(getRequest(url), params({ sourceId, stem: '../vocals' }))).status).toBe(404);
  });

  it('stores uploads under the per-user stems directory', async () => {
    currentUser = { userId: 'owner', role: 'member' };
    const { POST } = await import('@/app/api/stems/upload/route');
    const response = await POST(uploadRequest('Demo Song.mp3', new Uint8Array([1, 2, 3, 4])));
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.stemSet).toMatchObject({ sourceType: 'upload', title: 'Demo Song', status: 'pending' });

    const sets = await import('@/server/stems/stemSetRepository');
    expect(sets.getStemSet(payload.sourceId)?.inputPath).toBe(`stems/${payload.sourceId}/source.mp3`);

    const bad = await POST(uploadRequest('notes.txt', new Uint8Array([1])));
    expect(bad.status).toBe(415);
  });
});
