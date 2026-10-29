import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import { MessageChannel, MessagePort } from 'node:worker_threads';

Object.assign(globalThis, { MessageChannel, MessagePort, ReadableStream, TextDecoder, TextEncoder, TransformStream, WritableStream });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { File, FormData, Headers, Request, Response } = require('undici');
Object.assign(globalThis, { File, FormData, Headers, Request, Response });

describe('Quota & Admin Auth API Routes', () => {
  const memberUser = 'test_route_member';
  const memberPin = '1111';
  const memberId = 'usr_route_member_id';

  const adminUser = 'test_route_admin';
  const adminPin = '2222';
  const adminId = 'usr_route_admin_id';

  let NextRequestClass: typeof import('next/server').NextRequest;
  let SESSION_COOKIE_NAME: string;
  let memberSessionId: string;
  let adminSessionId: string;

  let quotaGetRoute: typeof import('@/app/api/auth/quota/route').GET;
  let changePinPostRoute: typeof import('@/app/api/auth/change-pin/route').POST;
  let adminUsersGetRoute: typeof import('@/app/api/auth/admin/users/route').GET;
  let adminUsersPostRoute: typeof import('@/app/api/auth/admin/users/route').POST;
  let adminUserPatchRoute: typeof import('@/app/api/auth/admin/users/[userId]/route').PATCH;
  let adminUserDeleteRoute: typeof import('@/app/api/auth/admin/users/[userId]/route').DELETE;

  beforeAll(async () => {
    const { getDatabase } = await import('@/server/persistence/database');
    const { hashPin } = await import('@/server/auth/pinSecurity');
    const { createSession } = await import('@/server/auth/authRepository');
    const guard = await import('@/server/auth/sessionGuard');
    SESSION_COOKIE_NAME = guard.SESSION_COOKIE_NAME;

    const nextServer = await import('next/server');
    NextRequestClass = nextServer.NextRequest;

    quotaGetRoute = (await import('@/app/api/auth/quota/route')).GET;
    changePinPostRoute = (await import('@/app/api/auth/change-pin/route')).POST;
    adminUsersGetRoute = (await import('@/app/api/auth/admin/users/route')).GET;
    adminUsersPostRoute = (await import('@/app/api/auth/admin/users/route')).POST;
    adminUserPatchRoute = (await import('@/app/api/auth/admin/users/[userId]/route')).PATCH;
    adminUserDeleteRoute = (await import('@/app/api/auth/admin/users/[userId]/route')).DELETE;

    const { sqlite } = getDatabase();
    const memH = hashPin(memberPin);
    const admH = hashPin(adminPin);

    sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, username, pin_hash, salt, display_name, role, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(memberId, memberUser, memH.hash, memH.salt, 'Member User', 'member', Date.now(), Date.now());

    sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, username, pin_hash, salt, display_name, role, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(adminId, adminUser, admH.hash, admH.salt, 'Admin User', 'admin', Date.now(), Date.now());

    memberSessionId = createSession(memberId).id;
    adminSessionId = createSession(adminId).id;
  });

  afterAll(async () => {
    const { getDatabase } = await import('@/server/persistence/database');
    const { sqlite } = getDatabase();
    sqlite.prepare('DELETE FROM users WHERE id IN (?, ?)').run(memberId, adminId);
  });

  describe('GET /api/auth/quota', () => {
    it('returns 1 remaining trial for anonymous user and issues cookie', async () => {
      const req = new NextRequestClass('http://localhost:3000/api/auth/quota', {
        method: 'GET',
      });
      const res = await quotaGetRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.isAuthenticated).toBe(false);
      expect(body.data.remainingTrials).toBe(1);
      expect(body.data.isQuotaExceeded).toBe(false);

      const cookieHeader = res.headers.get('set-cookie');
      expect(cookieHeader).toContain('chord_anon_token');
    });

    it('returns unlimited trials when logged in', async () => {
      const req = new NextRequestClass('http://localhost:3000/api/auth/quota', {
        method: 'GET',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${memberSessionId}`,
        },
      });
      const res = await quotaGetRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.isAuthenticated).toBe(true);
      expect(body.data.role).toBe('member');
      expect(body.data.isQuotaExceeded).toBe(false);
    });
  });

  describe('POST /api/auth/change-pin', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new NextRequestClass('http://localhost:3000/api/auth/change-pin', {
        method: 'POST',
        body: JSON.stringify({ oldPin: '1111', newPin: '3333' }),
      });
      const res = await changePinPostRoute(req);
      expect(res.status).toBe(401);
    });

    it('rejects wrong old pin with 400', async () => {
      const req = new NextRequestClass('http://localhost:3000/api/auth/change-pin', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${memberSessionId}`,
        },
        body: JSON.stringify({ oldPin: '9999', newPin: '3333' }),
      });
      const res = await changePinPostRoute(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_OLD_PIN');
    });

    it('changes PIN successfully when old pin is correct', async () => {
      const req = new NextRequestClass('http://localhost:3000/api/auth/change-pin', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${memberSessionId}`,
        },
        body: JSON.stringify({ oldPin: memberPin, newPin: '7777' }),
      });
      const res = await changePinPostRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('Admin Routes: /api/auth/admin/users', () => {
    let createdByAdminId: string;

    it('rejects non-admin user with 403 FORBIDDEN', async () => {
      const req = new NextRequestClass('http://localhost:3000/api/auth/admin/users', {
        method: 'GET',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${memberSessionId}`,
        },
      });
      const res = await adminUsersGetRoute(req);
      expect(res.status).toBe(403);
    });

    it('allows admin to list users', async () => {
      const req = new NextRequestClass('http://localhost:3000/api/auth/admin/users', {
        method: 'GET',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
      });
      const res = await adminUsersGetRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.users)).toBe(true);
    });

    it('allows admin to create a new user', async () => {
      const req = new NextRequestClass('http://localhost:3000/api/auth/admin/users', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
        body: JSON.stringify({
          username: 'friend_new_test',
          displayName: 'Friend New',
          pin: '6666',
          role: 'member',
        }),
      });
      const res = await adminUsersPostRoute(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.username).toBe('friend_new_test');
      createdByAdminId = body.data.user.id;
    });

    it('allows admin to reset PIN and update user', async () => {
      const req = new NextRequestClass(`http://localhost:3000/api/auth/admin/users/${createdByAdminId}`, {
        method: 'PATCH',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
        body: JSON.stringify({
          pin: '8888',
          displayName: 'Friend Updated',
        }),
      });
      const res = await adminUserPatchRoute(req, { params: Promise.resolve({ userId: createdByAdminId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.displayName).toBe('Friend Updated');
    });

    it('blocks admin from deleting themselves', async () => {
      const req = new NextRequestClass(`http://localhost:3000/api/auth/admin/users/${adminId}`, {
        method: 'DELETE',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
      });
      const res = await adminUserDeleteRoute(req, { params: Promise.resolve({ userId: adminId }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('CANNOT_DELETE_SELF');
    });

    it('allows admin to delete the created user', async () => {
      const req = new NextRequestClass(`http://localhost:3000/api/auth/admin/users/${createdByAdminId}`, {
        method: 'DELETE',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
      });
      const res = await adminUserDeleteRoute(req, { params: Promise.resolve({ userId: createdByAdminId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
