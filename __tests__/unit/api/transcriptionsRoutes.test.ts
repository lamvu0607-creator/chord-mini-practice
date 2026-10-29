import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import { MessageChannel, MessagePort } from 'node:worker_threads';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

Object.assign(globalThis, { MessageChannel, MessagePort, ReadableStream, TextDecoder, TextEncoder, TransformStream, WritableStream });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { File, FormData, Headers, Request, Response } = require('undici');
Object.assign(globalThis, { File, FormData, Headers, Request, Response });

describe('Transcriptions REST API Routes (Phase 3)', () => {
  let root: string;
  let NextRequestClass: typeof import('next/server').NextRequest;
  let singleRoute: typeof import('@/app/api/transcriptions/[videoId]/route');
  let usageRoute: typeof import('@/app/api/transcriptions/[videoId]/usage/route');
  let collectionRoute: typeof import('@/app/api/transcriptions/route');

  const testVideoId = 'test_phase3_vid';
  const beatModel = 'madmom';
  const chordModel = 'btc-sl';

  const samplePayload = {
    videoId: testVideoId,
    beatModel,
    chordModel,
    title: 'Phase 3 Test Song',
    channelTitle: 'Test Channel',
    bpm: 120,
    timeSignature: 4,
    keySignature: 'Am',
    audioDuration: 180,
    beats: [{ time: 0.5, beatNumber: 1, isDownbeat: true }, { time: 1.0, beatNumber: 2, isDownbeat: false }],
    chords: [{ chord: 'Am', startTime: 0.0, endTime: 2.0 }],
    synchronizedChords: [{ chord: 'Am', beatIndex: 0 }],
  };

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-phase3-'));
    process.env.SQLITE_DATABASE_PATH = path.join(root, 'db', 'phase3_test.sqlite');
    process.env.LOCAL_AUDIO_STORAGE_DIR = path.join(root, 'audio');
    await mkdir(process.env.LOCAL_AUDIO_STORAGE_DIR, { recursive: true });

    const nextServer = await import('next/server');
    NextRequestClass = nextServer.NextRequest;

    singleRoute = await import('@/app/api/transcriptions/[videoId]/route');
    usageRoute = await import('@/app/api/transcriptions/[videoId]/usage/route');
    collectionRoute = await import('@/app/api/transcriptions/route');
  });

  afterAll(async () => {
    const { closeDatabaseForTests } = await import('@/server/persistence/database');
    closeDatabaseForTests();
    await rm(root, { recursive: true, force: true });
  });

  it('GET /api/transcriptions/[videoId] returns 400 for invalid videoId', async () => {
    const req = new NextRequestClass('http://localhost:3000/api/transcriptions/   ');
    const res = await singleRoute.GET(req, { params: Promise.resolve({ videoId: '   ' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_VIDEO_ID');
  });

  it('GET /api/transcriptions/[videoId] returns 404 when transcription does not exist', async () => {
    const req = new NextRequestClass(`http://localhost:3000/api/transcriptions/${testVideoId}?beatModel=${beatModel}&chordModel=${chordModel}`);
    const res = await singleRoute.GET(req, { params: Promise.resolve({ videoId: testVideoId }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
  });

  it('POST /api/transcriptions saves transcription and returns 201 Created', async () => {
    const req = new NextRequestClass('http://localhost:3000/api/transcriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePayload),
    });
    const res = await collectionRoute.POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.videoId).toBe(testVideoId);
    expect(body.data.title).toBe('Phase 3 Test Song');
  });

  it('GET /api/transcriptions/[videoId] returns 200 with cached transcription', async () => {
    const req = new NextRequestClass(`http://localhost:3000/api/transcriptions/${testVideoId}?beatModel=${beatModel}&chordModel=${chordModel}`);
    const res = await singleRoute.GET(req, { params: Promise.resolve({ videoId: testVideoId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.cached).toBe(true);
    expect(body.data.videoId).toBe(testVideoId);
    expect(body.data.keySignature).toBe('Am');
  });

  it('GET /api/transcriptions/[videoId] returns variants when models are omitted', async () => {
    const req = new NextRequestClass(`http://localhost:3000/api/transcriptions/${testVideoId}`);
    const res = await singleRoute.GET(req, { params: Promise.resolve({ videoId: testVideoId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.videoId).toBe(testVideoId);
    expect(Array.isArray(body.variants)).toBe(true);
    expect(body.variants.length).toBeGreaterThan(0);
  });

  it('PATCH /api/transcriptions/[videoId]/usage increments usage count', async () => {
    const req = new NextRequestClass(`http://localhost:3000/api/transcriptions/${testVideoId}/usage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beatModel, chordModel }),
    });
    const res = await usageRoute.PATCH(req, { params: Promise.resolve({ videoId: testVideoId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.usageCount).toBe(1);

    // Second increment
    const req2 = new NextRequestClass(`http://localhost:3000/api/transcriptions/${testVideoId}/usage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beatModel, chordModel }),
    });
    const res2 = await usageRoute.PATCH(req2, { params: Promise.resolve({ videoId: testVideoId }) });
    const body2 = await res2.json();
    expect(body2.usageCount).toBe(2);
  });

  it('GET /api/transcriptions without videoId serves recent videos list', async () => {
    const req = new NextRequestClass('http://localhost:3000/api/transcriptions?key=all&limit=10');
    const res = await collectionRoute.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.videos)).toBe(true);
    expect(body.data.videos.length).toBeGreaterThan(0);
    expect(body.data.videos[0].videoId).toBe(testVideoId);
  });

  it('PATCH /api/transcriptions enriches transcription with updated key or corrections', async () => {
    const req = new NextRequestClass('http://localhost:3000/api/transcriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: testVideoId,
        beatModel,
        chordModel,
        enrichment: {
          keySignature: 'C',
          title: 'Enriched Title',
        },
      }),
    });
    const res = await collectionRoute.PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Enriched Title');
    expect(body.data.keySignature).toBe('C');
  });
});
