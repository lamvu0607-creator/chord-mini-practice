import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import { MessageChannel, MessagePort } from 'node:worker_threads';

Object.assign(globalThis, { MessageChannel, MessagePort, ReadableStream, TextDecoder, TextEncoder, TransformStream, WritableStream });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { File, FormData, Headers, Request, Response } = require('undici');
Object.assign(globalThis, { File, FormData, Headers, Request, Response });

describe('Audio Stream API Route (/api/audio/[videoId])', () => {
  const videoId = 'test_phase2_stream';
  const audioContent = Buffer.alloc(1024, 0x42); // 1024 bytes of test audio
  let getRoute: typeof import('@/app/api/audio/[videoId]/route').GET;
  let headRoute: typeof import('@/app/api/audio/[videoId]/route').HEAD;
  let deleteRoute: typeof import('@/app/api/audio/[videoId]/route').DELETE;
  let NextRequestClass: typeof import('next/server').NextRequest;
  let adminSessionId: string;
  let memberSessionId: string;
  let SESSION_COOKIE_NAME: string;

  beforeAll(async () => {
    const nextServer = await import('next/server');
    NextRequestClass = nextServer.NextRequest;

    const audioMod = await import('@/app/api/audio/[videoId]/route');
    getRoute = audioMod.GET;
    headRoute = audioMod.HEAD;
    deleteRoute = audioMod.DELETE;

    const { saveLocalAudioFile } = await import('@/services/storage/localAudioStorageService');
    await saveLocalAudioFile(videoId, new Uint8Array(audioContent), {
      filename: `${videoId}.mp3`,
      contentType: 'audio/mpeg',
    });

    // Create admin and member sessions for auth tests
    const { getDatabase } = await import('@/server/persistence/database');
    const { createSession } = await import('@/server/auth/authRepository');
    const { hashPin } = await import('@/server/auth/pinSecurity');
    const guard = await import('@/server/auth/sessionGuard');
    SESSION_COOKIE_NAME = guard.SESSION_COOKIE_NAME;

    const { sqlite } = getDatabase();
    const { hash, salt } = hashPin('1234');

    sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, username, pin_hash, salt, display_name, role, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('usr_test_admin', 'audio_admin', hash, salt, 'Audio Admin', 'admin', Date.now(), Date.now());

    sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, username, pin_hash, salt, display_name, role, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('usr_test_member', 'audio_member', hash, salt, 'Audio Member', 'member', Date.now(), Date.now());

    const adminSession = createSession('usr_test_admin');
    adminSessionId = adminSession.id;

    const memberSession = createSession('usr_test_member');
    memberSessionId = memberSession.id;
  });

  afterAll(async () => {
    const { deleteLocalAudioFile } = await import('@/services/storage/localAudioStorageService');
    await deleteLocalAudioFile(`${videoId}.mp3`).catch(() => {});

    const { getDatabase } = await import('@/server/persistence/database');
    const { sqlite } = getDatabase();
    sqlite.prepare('DELETE FROM users WHERE id IN (?, ?)').run('usr_test_admin', 'usr_test_member');
  });

  it('returns 404 for a nonexistent audio videoId', async () => {
    const req = new NextRequestClass('http://localhost:3000/api/audio/nonexistent_id_xyz');
    const res = await getRoute(req, { params: Promise.resolve({ videoId: 'nonexistent_id_xyz' }) });
    expect(res.status).toBe(404);
  });

  it('streams full audio file with status 200 when no range header is passed', async () => {
    const req = new NextRequestClass(`http://localhost:3000/api/audio/${videoId}`);
    const res = await getRoute(req, { params: Promise.resolve({ videoId }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('Content-Length')).toBe('1024');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('handles Range requests with status 206 Partial Content', async () => {
    const req = new NextRequestClass(`http://localhost:3000/api/audio/${videoId}`, {
      headers: {
        range: 'bytes=0-499',
      },
    });
    const res = await getRoute(req, { params: Promise.resolve({ videoId }) });

    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-499/1024');
    expect(res.headers.get('Content-Length')).toBe('500');
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
  });

  it('returns 416 Range Not Satisfiable when range is invalid or out of bounds', async () => {
    const req = new NextRequestClass(`http://localhost:3000/api/audio/${videoId}`, {
      headers: {
        range: 'bytes=2000-3000',
      },
    });
    const res = await getRoute(req, { params: Promise.resolve({ videoId }) });
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */1024');
  });

  it('returns JSON metadata when ?metadata=true is queried', async () => {
    const req = new NextRequestClass(`http://localhost:3000/api/audio/${videoId}?metadata=true`);
    const res = await getRoute(req, { params: Promise.resolve({ videoId }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.videoId).toBe(videoId);
    expect(body.data.fileSize).toBe(1024);
    expect(body.data.audioUrl).toBe(`/api/audio/${videoId}`);
  });

  it('handles HEAD request returning Content-Length and Accept-Ranges', async () => {
    const req = new NextRequestClass(`http://localhost:3000/api/audio/${videoId}`, { method: 'HEAD' });
    const res = await headRoute(req, { params: Promise.resolve({ videoId }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe('1024');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('enforces Admin authorization on DELETE', async () => {
    // Unauthenticated delete
    const unauthReq = new NextRequestClass(`http://localhost:3000/api/audio/${videoId}`, { method: 'DELETE' });
    const unauthRes = await deleteRoute(unauthReq, { params: Promise.resolve({ videoId }) });
    expect(unauthRes.status).toBe(401);

    // Member delete (forbidden)
    const memberReq = new NextRequestClass(`http://localhost:3000/api/audio/${videoId}`, {
      method: 'DELETE',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${memberSessionId}` },
    });
    const memberRes = await deleteRoute(memberReq, { params: Promise.resolve({ videoId }) });
    expect(memberRes.status).toBe(403);

    // Admin delete (success)
    const adminReq = new NextRequestClass(`http://localhost:3000/api/audio/${videoId}`, {
      method: 'DELETE',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}` },
    });
    const adminRes = await deleteRoute(adminReq, { params: Promise.resolve({ videoId }) });
    expect(adminRes.status).toBe(200);
    const body = await adminRes.json();
    expect(body.success).toBe(true);
  });
});
