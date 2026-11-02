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
    requireAdmin: jest.fn(async () => (currentUser?.role === 'admin'
      ? { user: currentUser }
      : { errorResponse: NextResponse.json({ success: false }, { status: 403 }) })),
  };
});

const UPLOAD_ID = 'upload_abcdef0123456789abcdef01';
const YOUTUBE_ID = 'dQw4w9WgXcQ';

const context = (videoId: string) => ({ params: Promise.resolve({ videoId }) });
const member = (userId: string): TestUser => ({ userId, role: 'member' });

function nameRequest(videoId: string, method: string, body?: unknown) {
  return new Request(`http://localhost/api/songs/${videoId}/name`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('song names and the shared song list', () => {
  let root: string;

  async function load() {
    const names = await import('@/app/api/songs/[videoId]/name/route');
    const recent = await import('@/app/api/transcriptions/recent/route');
    const storage = await import('@/services/storage/localAudioStorageService');
    const transcriptions = await import('@/server/persistence/transcriptionRepository');
    const list = async (query = '') => {
      const { NextRequest: RealNextRequest } = await import('next/server');
      const response = await recent.GET(new RealNextRequest(`http://localhost/api/transcriptions/recent?${query}`));
      return response.json() as Promise<{ videos: Array<{ videoId: string; title: string; customName?: string; thumbnailUrl?: string }>; nextCursor: string | null }>;
    };
    return { ...names, list, storage, transcriptions };
  }

  async function seedSongs(transcriptions: Awaited<ReturnType<typeof load>>['transcriptions']) {
    const base = { beatModel: 'madmom', chordModel: 'btc-sl', beats: [], chords: [], synchronizedChords: [], createdAt: 1 };
    transcriptions.upsertTranscription({ ...base, videoId: YOUTUBE_ID, title: 'Public 100%_song' } as never);
    transcriptions.upsertTranscription({ ...base, videoId: UPLOAD_ID, title: 'Private clip' } as never);
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-song-list-'));
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

  it('requires sign-in to read or change a name', async () => {
    const { GET, PUT, DELETE } = await load();
    expect((await GET(nameRequest(UPLOAD_ID, 'GET'), context(UPLOAD_ID))).status).toBe(401);
    expect((await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'x' }), context(UPLOAD_ID))).status).toBe(401);
    expect((await DELETE(nameRequest(UPLOAD_ID, 'DELETE'), context(UPLOAD_ID))).status).toBe(401);
  });

  it('validates the song id, the name and that the song exists', async () => {
    currentUser = member('u1');
    const { PUT, storage } = await load();
    expect((await PUT(nameRequest('bad', 'PUT', { name: 'x' }), context('bad'))).status).toBe(400);
    expect((await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'x' }), context(UPLOAD_ID))).status).toBe(404);

    await storage.saveLocalAudioFile(UPLOAD_ID, new Uint8Array([1]), { filename: 'a.wav' });
    expect((await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: '   ' }), context(UPLOAD_ID))).status).toBe(400);
    expect((await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'x'.repeat(121) }), context(UPLOAD_ID))).status).toBe(400);

    const saved = await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: '  My take  ' }), context(UPLOAD_ID));
    expect((await saved.json()).songName).toEqual({ name: 'My take', canEdit: true });
  });

  it('lets only the first namer and admins change a name', async () => {
    currentUser = member('namer');
    const { GET, PUT, DELETE, storage } = await load();
    await storage.saveLocalAudioFile(UPLOAD_ID, new Uint8Array([1]), { filename: 'a.wav' });
    await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'Original' }), context(UPLOAD_ID));

    currentUser = member('other');
    expect((await (await GET(nameRequest(UPLOAD_ID, 'GET'), context(UPLOAD_ID))).json()).songName).toEqual({ name: 'Original', canEdit: false });
    expect((await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'Hijacked' }), context(UPLOAD_ID))).status).toBe(403);
    expect((await DELETE(nameRequest(UPLOAD_ID, 'DELETE'), context(UPLOAD_ID))).status).toBe(403);

    currentUser = { userId: 'admin', role: 'admin' };
    expect((await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'Fixed' }), context(UPLOAD_ID))).status).toBe(200);

    currentUser = member('namer');
    expect((await (await GET(nameRequest(UPLOAD_ID, 'GET'), context(UPLOAD_ID))).json()).songName).toEqual({ name: 'Fixed', canEdit: true });
  });

  it('clearing a name keeps the audio', async () => {
    currentUser = member('u1');
    const { GET, PUT, DELETE, storage } = await load();
    await storage.saveLocalAudioFile(UPLOAD_ID, new Uint8Array([1]), { filename: 'a.wav' });
    await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'Keep me' }), context(UPLOAD_ID));

    expect((await DELETE(nameRequest(UPLOAD_ID, 'DELETE'), context(UPLOAD_ID))).status).toBe(200);
    expect((await (await GET(nameRequest(UPLOAD_ID, 'GET'), context(UPLOAD_ID))).json()).songName).toBeNull();
    expect(await storage.findExistingLocalAudioFile(UPLOAD_ID)).not.toBeNull();
    expect((await DELETE(nameRequest(UPLOAD_ID, 'DELETE'), context(UPLOAD_ID))).status).toBe(404);
  });

  it('keeps the audio of named YouTube songs out of quota eviction', async () => {
    currentUser = member('u1');
    const { PUT, storage } = await load();
    const { claimAudioForEviction, releaseAudioEviction } = await import('@/server/persistence/audioRepository');
    const saved = await storage.saveLocalAudioFile(YOUTUBE_ID, new Uint8Array([1]), { filename: 'a.mp3' });

    expect(claimAudioForEviction(1024).map((row) => row.videoId)).toEqual([YOUTUBE_ID]);
    releaseAudioEviction(saved.filename);

    await PUT(nameRequest(YOUTUBE_ID, 'PUT', { name: 'Favourite' }), context(YOUTUBE_ID));
    expect(claimAudioForEviction(1024)).toEqual([]);
  });

  it('removes the name of an upload when an admin deletes its file, but keeps YouTube names', async () => {
    currentUser = { userId: 'admin', role: 'admin' };
    const { GET, PUT, storage } = await load();
    const audio = await import('@/app/api/audio/[videoId]/route');
    await storage.saveLocalAudioFile(UPLOAD_ID, new Uint8Array([1]), { filename: 'a.wav' });
    await storage.saveLocalAudioFile(YOUTUBE_ID, new Uint8Array([1]), { filename: 'b.mp3' });
    await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'Upload' }), context(UPLOAD_ID));
    await PUT(nameRequest(YOUTUBE_ID, 'PUT', { name: 'YouTube' }), context(YOUTUBE_ID));

    await audio.DELETE(nameRequest(UPLOAD_ID, 'DELETE'), context(UPLOAD_ID));
    await audio.DELETE(nameRequest(YOUTUBE_ID, 'DELETE'), context(YOUTUBE_ID));

    expect((await (await GET(nameRequest(UPLOAD_ID, 'GET'), context(UPLOAD_ID))).json()).songName).toBeNull();
    expect((await (await GET(nameRequest(YOUTUBE_ID, 'GET'), context(YOUTUBE_ID))).json()).songName).toMatchObject({ name: 'YouTube' });
  });

  it('never shows uploads or custom names to signed-out visitors', async () => {
    const { PUT, list, transcriptions } = await load();
    await seedSongs(transcriptions);
    currentUser = member('u1');
    await PUT(nameRequest(YOUTUBE_ID, 'PUT', { name: 'Secret name' }), context(YOUTUBE_ID));

    currentUser = null;
    const { videos } = await list('uploads=1');
    expect(videos.map((video) => video.videoId)).toEqual([YOUTUBE_ID]);
    expect(videos[0]).not.toHaveProperty('customName');
    expect((await list('uploads=1&q=Secret')).videos).toEqual([]);
    expect((await list('uploads=1&q=Private')).videos).toEqual([]);
  });

  it('lists uploads and custom names for signed-in users who ask for uploads', async () => {
    const { PUT, list, transcriptions, storage } = await load();
    await seedSongs(transcriptions);
    await storage.saveLocalAudioFile(UPLOAD_ID, new Uint8Array([1]), { filename: 'a.wav' });
    currentUser = member('u1');
    await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'My clip' }), context(UPLOAD_ID));

    const withUploads = await list('uploads=1');
    expect(withUploads.videos.map((video) => video.videoId).sort()).toEqual([YOUTUBE_ID, UPLOAD_ID].sort());
    const upload = withUploads.videos.find((video) => video.videoId === UPLOAD_ID)!;
    expect(upload).toMatchObject({ customName: 'My clip', title: 'Private clip' });
    expect(upload.thumbnailUrl ?? '').not.toContain('ytimg');

    // The Stems page omits uploads=1 because it cannot split upload_* ids.
    expect((await list()).videos.map((video) => video.videoId)).toEqual([YOUTUBE_ID]);
  });

  it('searches original titles and custom names, treating % and _ literally', async () => {
    const { PUT, list, transcriptions, storage } = await load();
    await seedSongs(transcriptions);
    await storage.saveLocalAudioFile(UPLOAD_ID, new Uint8Array([1]), { filename: 'a.wav' });
    currentUser = member('u1');
    await PUT(nameRequest(UPLOAD_ID, 'PUT', { name: 'Rehearsal take' }), context(UPLOAD_ID));

    const ids = async (query: string) => (await list(`uploads=1&q=${encodeURIComponent(query)}`)).videos.map((video) => video.videoId);
    expect(await ids('rehearsal')).toEqual([UPLOAD_ID]);
    expect(await ids('private')).toEqual([UPLOAD_ID]);
    expect(await ids('100%_')).toEqual([YOUTUBE_ID]);
    expect(await ids('%')).toEqual([YOUTUBE_ID]);
    expect(await ids('_clip')).toEqual([]);
  });

  it('pages through search results', async () => {
    const { list, transcriptions } = await load();
    currentUser = member('u1');
    const base = { beatModel: 'madmom', chordModel: 'btc-sl', beats: [], chords: [], synchronizedChords: [] };
    for (const [index, videoId] of ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'].entries()) {
      transcriptions.upsertTranscription({ ...base, videoId, title: index === 1 ? 'Other' : `Match ${index}`, createdAt: index + 1 } as never);
    }

    const first = await list('q=match&limit=1');
    expect(first.videos).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await list(`q=match&limit=1&cursor=${first.nextCursor}`);
    expect(second.videos).toHaveLength(1);
    expect(second.videos[0].videoId).not.toBe(first.videos[0].videoId);
    expect(second.nextCursor).toBeNull();
  });
});
