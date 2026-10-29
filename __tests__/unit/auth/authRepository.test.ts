import {
  cleanupExpiredSessions,
  createSession,
  deleteSession,
  findSessionWithUser,
  findUserById,
  findUserByUsername,
} from '@/server/auth/authRepository';
import { getDatabase } from '@/server/persistence/database';
import { hashPin } from '@/server/auth/pinSecurity';

describe('authRepository', () => {
  const testUsername = 'test_user_phase1';
  const testPin = '8888';
  let createdUserId: string;

  beforeAll(() => {
    const { sqlite } = getDatabase();
    const { hash, salt } = hashPin(testPin);
    createdUserId = 'usr_test_phase1_id';

    // Insert or update test user
    sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, username, pin_hash, salt, display_name, role, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(createdUserId, testUsername, hash, salt, 'Test User', 'member', Date.now(), Date.now());
  });

  afterAll(() => {
    const { sqlite } = getDatabase();
    sqlite.prepare('DELETE FROM users WHERE id = ?').run(createdUserId);
  });

  describe('findUserByUsername', () => {
    it('finds existing user case-insensitively', () => {
      const user = findUserByUsername(testUsername.toUpperCase());
      expect(user).not.toBeNull();
      expect(user?.id).toBe(createdUserId);
      expect(user?.username).toBe(testUsername);
      expect(user?.displayName).toBe('Test User');
    });

    it('returns null for nonexistent username', () => {
      const user = findUserByUsername('nonexistent_user_xyz');
      expect(user).toBeNull();
    });
  });

  describe('findUserById', () => {
    it('finds user by exact ID', () => {
      const user = findUserById(createdUserId);
      expect(user).not.toBeNull();
      expect(user?.username).toBe(testUsername);
    });

    it('returns null for nonexistent ID', () => {
      expect(findUserById('nonexistent_id')).toBeNull();
    });
  });

  describe('createSession & findSessionWithUser', () => {
    it('creates a session and retrieves authenticated user', () => {
      const session = createSession(createdUserId, { userAgent: 'Jest-Test-Agent' });
      expect(session.id).toHaveLength(64);
      expect(session.userId).toBe(createdUserId);

      const authUser = findSessionWithUser(session.id);
      expect(authUser).not.toBeNull();
      expect(authUser?.userId).toBe(createdUserId);
      expect(authUser?.username).toBe(testUsername);
      expect(authUser?.displayName).toBe('Test User');

      // Cleanup
      deleteSession(session.id);
      expect(findSessionWithUser(session.id)).toBeNull();
    });

    it('returns null and cleans up expired session', () => {
      // Create session with negative duration (already expired)
      const session = createSession(createdUserId, { durationMs: -1000 });
      const authUser = findSessionWithUser(session.id);

      expect(authUser).toBeNull();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('cleans up all sessions that are expired', () => {
      const s1 = createSession(createdUserId, { durationMs: -5000 });
      const s2 = createSession(createdUserId, { durationMs: 100000 });

      const cleanedCount = cleanupExpiredSessions();
      expect(cleanedCount).toBeGreaterThanOrEqual(1);

      expect(findSessionWithUser(s1.id)).toBeNull();
      expect(findSessionWithUser(s2.id)).not.toBeNull();

      deleteSession(s2.id);
    });
  });
});
