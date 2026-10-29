import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import { MessageChannel, MessagePort } from 'node:worker_threads';

Object.assign(globalThis, { MessageChannel, MessagePort, ReadableStream, TextDecoder, TextEncoder, TransformStream, WritableStream });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { File, FormData, Headers, Request, Response } = require('undici');
Object.assign(globalThis, { File, FormData, Headers, Request, Response });

describe('Auth API Routes', () => {
  const username = 'router_test_user';
  const pin = '5555';
  const userId = 'usr_router_test_id';

  let loginRoute: typeof import('@/app/api/auth/login/route').POST;
  let logoutRoute: typeof import('@/app/api/auth/logout/route').POST;
  let meRoute: typeof import('@/app/api/auth/me/route').GET;
  let NextRequestClass: typeof import('next/server').NextRequest;
  let SESSION_COOKIE_NAME: string;

  beforeAll(async () => {
    const { getDatabase } = await import('@/server/persistence/database');
    const { hashPin } = await import('@/server/auth/pinSecurity');
    const guard = await import('@/server/auth/sessionGuard');
    SESSION_COOKIE_NAME = guard.SESSION_COOKIE_NAME;

    const nextServer = await import('next/server');
    NextRequestClass = nextServer.NextRequest;

    const loginMod = await import('@/app/api/auth/login/route');
    loginRoute = loginMod.POST;

    const logoutMod = await import('@/app/api/auth/logout/route');
    logoutRoute = logoutMod.POST;

    const meMod = await import('@/app/api/auth/me/route');
    meRoute = meMod.GET;

    const { sqlite } = getDatabase();
    const { hash, salt } = hashPin(pin);
    sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, username, pin_hash, salt, display_name, role, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, username, hash, salt, 'Router User', 'member', Date.now(), Date.now());
  });

  afterAll(async () => {
    const { getDatabase } = await import('@/server/persistence/database');
    const { sqlite } = getDatabase();
    sqlite.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  it('rejects login with invalid pin format', async () => {
    const req = new NextRequestClass('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, pin: '12' }),
    });
    const res = await loginRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_PIN_FORMAT');
  });

  it('rejects login with wrong pin', async () => {
    const req = new NextRequestClass('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, pin: '9999' }),
    });
    const res = await loginRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in successfully and sets cookie on correct credentials', async () => {
    const req = new NextRequestClass('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, pin }),
    });
    const res = await loginRoute(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.username).toBe(username);
    expect(body.data.user.displayName).toBe('Router User');

    // Check Set-Cookie
    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toHaveLength(64);

    // Verify /api/auth/me with the issued cookie
    const meReq = new NextRequestClass('http://localhost:3000/api/auth/me', {
      method: 'GET',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie?.value}`,
      },
    });
    const meRes = await meRoute(meReq);
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.success).toBe(true);
    expect(meBody.data.user.id).toBe(userId);

    // Logout
    const logoutReq = new NextRequestClass('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie?.value}`,
      },
    });
    const logoutRes = await logoutRoute(logoutReq);
    expect(logoutRes.status).toBe(200);

    // After logout, /api/auth/me should return 401
    const meAfterLogoutRes = await meRoute(meReq);
    expect(meAfterLogoutRes.status).toBe(401);
  });
});
