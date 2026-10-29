import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import { MessageChannel, MessagePort } from 'node:worker_threads';
import type { NextRequest } from 'next/server';

Object.assign(globalThis, { MessageChannel, MessagePort, ReadableStream, TextDecoder, TextEncoder, TransformStream, WritableStream });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Headers, Request, Response } = require('undici');
Object.assign(globalThis, { Headers, Request, Response });

let role: 'admin' | 'member' | null = null;
jest.mock('@/server/auth/sessionGuard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextResponse } = require('next/server');
  return {
    requireAdmin: jest.fn(async () => {
      if (!role) return { errorResponse: NextResponse.json({ success: false }, { status: 401 }) };
      if (role !== 'admin') return { errorResponse: NextResponse.json({ success: false }, { status: 403 }) };
      return { user: { userId: 'root', role } };
    }),
  };
});

function sample(videoId: string, beatModel: string, chordModel: string) {
  return {
    videoId, beatModel, chordModel, createdAt: Date.now(), title: `Song ${videoId}`,
    beats: [{ time: 0, strength: 1 }],
    chords: [{ start: 0, end: 1, time: 0, chord: 'C', confidence: 0.9 }],
    synchronizedChords: [{ chord: 'C', beatIndex: 0 }], keySignature: 'C major',
  };
}

describe('deleting a song from recent analyses', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-transcription-delete-'));
    process.env.SQLITE_DATABASE_PATH = path.join(root, 'db', 'test.sqlite');
    process.env.LOCAL_AUDIO_STORAGE_DIR = path.join(root, 'audio');
    await mkdir(process.env.LOCAL_AUDIO_STORAGE_DIR, { recursive: true });
    role = null;
    jest.resetModules();
  });

  afterEach(async () => {
    const { closeDatabaseForTests } = await import('@/server/persistence/database');
    closeDatabaseForTests();
    await rm(root, { recursive: true, force: true });
  });

  it('removes every model variant and its search keys, leaving other songs alone', async () => {
    const repo = await import('@/server/persistence/transcriptionRepository');
    const { getDatabase } = await import('@/server/persistence/database');
    repo.upsertTranscription(sample('aaaaaaaaaaa', 'madmom', 'btc-sl') as never);
    repo.upsertTranscription(sample('aaaaaaaaaaa', 'beat-transformer', 'btc-pl') as never);
    repo.upsertTranscription(sample('bbbbbbbbbbb', 'madmom', 'btc-sl') as never);

    expect(repo.deleteVideoTranscriptions('aaaaaaaaaaa')).toBe(2);
    expect(repo.findVideoTranscriptions('aaaaaaaaaaa')).toHaveLength(0);
    expect(repo.findVideoTranscriptions('bbbbbbbbbbb')).toHaveLength(1);
    const orphanKeys = getDatabase().sqlite.prepare(`SELECT COUNT(*) AS n FROM transcription_search_keys
      WHERE transcription_id NOT IN (SELECT id FROM transcriptions)`).get() as { n: number };
    expect(orphanKeys.n).toBe(0);
    expect(repo.deleteVideoTranscriptions('aaaaaaaaaaa')).toBe(0);
  });

  it('only lets admins delete through the API', async () => {
    const repo = await import('@/server/persistence/transcriptionRepository');
    repo.upsertTranscription(sample('ccccccccccc', 'madmom', 'btc-sl') as never);
    const { DELETE } = await import('@/app/api/transcriptions/[videoId]/route');
    const call = () => DELETE(
      new Request('http://localhost/api/transcriptions/ccccccccccc', { method: 'DELETE' }) as unknown as NextRequest,
      { params: Promise.resolve({ videoId: 'ccccccccccc' }) },
    );

    expect((await call()).status).toBe(401);
    role = 'member';
    expect((await call()).status).toBe(403);
    expect(repo.findVideoTranscriptions('ccccccccccc')).toHaveLength(1);

    role = 'admin';
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, deleted: 1 });
    expect((await call()).status).toBe(404);
  });
});
