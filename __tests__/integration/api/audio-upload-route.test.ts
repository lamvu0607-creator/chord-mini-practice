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

/** undici cannot parse multipart bodies under jsdom, so hand the route an already-parsed form. */
function uploadRequest(fileName: string, bytes: Uint8Array, title?: string) {
  const file = new File([bytes], fileName, { type: 'application/octet-stream' });
  return {
    headers: new Headers({ 'content-length': String(bytes.byteLength) }),
    formData: async () => ({
      get: (name: string) => (name === 'file' ? file : name === 'title' ? title ?? null : null),
    }),
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

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

describe('/api/audio/upload', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-audio-upload-'));
    process.env.SQLITE_DATABASE_PATH = path.join(root, 'db', 'test.sqlite');
    process.env.LOCAL_AUDIO_STORAGE_DIR = path.join(root, 'audio');
    await mkdir(process.env.LOCAL_AUDIO_STORAGE_DIR, { recursive: true });
    currentUser = null;
    jest.resetModules();
  });

  afterEach(async () => {
    const { closeDatabaseForTests } = await import('@/server/persistence/database');
    closeDatabaseForTests();
    delete process.env.LOCAL_AUDIO_MAX_UPLOAD_MB;
    await rm(root, { recursive: true, force: true });
  });

  it('requires sign-in', async () => {
    const { POST } = await import('@/app/api/audio/upload/route');
    expect((await POST(uploadRequest('song.mp3', new Uint8Array([1, 2, 3])))).status).toBe(401);
  });

  it('rejects unsupported formats and oversized files', async () => {
    currentUser = { userId: 'user-a', role: 'member' };
    const { POST } = await import('@/app/api/audio/upload/route');
    expect((await POST(uploadRequest('notes.txt', new Uint8Array([1])))).status).toBe(415);

    process.env.LOCAL_AUDIO_MAX_UPLOAD_MB = '0.000001';
    expect((await POST(uploadRequest('song.mp3', new Uint8Array(64)))).status).toBe(413);
  });

  it('stores the file under a per-user upload id that /api/audio/<id> serves', async () => {
    currentUser = { userId: 'user-a', role: 'member' };
    const { POST } = await import('@/app/api/audio/upload/route');
    const { isUploadSourceId } = await import('@/utils/uploadSourceId');
    const bytes = new Uint8Array([10, 20, 30, 40]);

    const first = await (await POST(uploadRequest('My Song.flac', bytes))).json();
    expect(first).toMatchObject({ success: true, title: 'My Song', existing: false });
    expect(isUploadSourceId(first.id)).toBe(true);

    // Same user + same content: same id, no second copy.
    const again = await (await POST(uploadRequest('renamed.flac', bytes))).json();
    expect(again).toMatchObject({ success: true, id: first.id, existing: true });

    // Another user uploading the same file gets a different, unguessable id.
    currentUser = { userId: 'user-b', role: 'member' };
    const other = await (await POST(uploadRequest('My Song.flac', bytes))).json();
    expect(other.id).not.toBe(first.id);

    const { GET } = await import('@/app/api/audio/[videoId]/route');
    const url = `http://localhost/api/audio/${first.id}`;
    const getRequest = Object.assign(new Request(url), { nextUrl: new URL(url) }) as unknown as NextRequest;
    const served = await GET(getRequest, params({ videoId: first.id }));
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('audio/flac');
  });

  it('keeps uploads out of public lists and out of quota eviction', async () => {
    const storage = await import('@/services/storage/localAudioStorageService');
    const audioRepository = await import('@/server/persistence/audioRepository');
    const transcriptions = await import('@/server/persistence/transcriptionRepository');
    const uploadId = 'upload_0123456789abcdef01234567';

    await storage.saveLocalAudioFile('dQw4w9WgXcQ', new Uint8Array([1, 2]), { filename: 'yt.mp3' });
    await storage.saveLocalAudioFile(uploadId, new Uint8Array([3, 4]), { filename: 'mine.mp3' });
    const claimed = audioRepository.claimAudioForEviction(Number.MAX_SAFE_INTEGER);
    expect(claimed.map((entry) => entry.videoId)).toEqual(['dQw4w9WgXcQ']);

    const sample = (videoId: string, createdAt: number) => ({
      videoId, beatModel: 'madmom', chordModel: 'chord-cnn-lstm', createdAt, title: `Song ${videoId}`,
      beats: [{ time: 0, strength: 1 }],
      chords: [{ start: 0, end: 1, time: 0, chord: 'C', confidence: 0.9 }],
      synchronizedChords: [{ chord: 'C', beatIndex: 0 }], keySignature: 'C',
    });
    transcriptions.upsertTranscription(sample('dQw4w9WgXcQ', 1000) as never);
    transcriptions.upsertTranscription(sample(uploadId, 2000) as never);
    const recent = transcriptions.findRecentTranscriptions({ selectedKey: 'all', limit: 10 });
    expect(recent.videos.map((video) => video.videoId)).toEqual(['dQw4w9WgXcQ']);
    // Still reachable directly by its link.
    expect(transcriptions.findTranscription(uploadId, 'madmom', 'chord-cnn-lstm')).not.toBeNull();
  });
});
