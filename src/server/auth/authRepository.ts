import 'server-only';
import { getDatabase } from '@/server/persistence/database';
import { generateSessionToken, generateUserId, hashPin } from './pinSecurity';

export type UserRole = 'admin' | 'member';

export type SafeUser = Omit<UserRecord, 'pinHash' | 'salt'>;

export interface UserRecord {
  id: string;
  username: string;
  pinHash: string;
  salt: string;
  displayName: string;
  role: UserRole;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAtMs: number;
  createdAtMs: number;
  lastActiveAtMs: number;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface AuthenticatedUser {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  expiresAtMs: number;
}

const DEFAULT_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SLIDING_ACTIVITY_THRESHOLD_MS = 5 * 60 * 1000; // update active timestamp every 5 mins

interface DbUserRow {
  id: string;
  username: string;
  pin_hash: string;
  salt: string;
  display_name: string;
  role: string;
  created_at_ms: number;
  updated_at_ms: number;
}

interface DbSessionUserRow {
  session_id: string;
  expires_at_ms: number;
  last_active_at_ms: number;
  user_id: string;
  username: string;
  display_name: string;
  role: string;
}

function mapUserRow(row: DbUserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    pinHash: row.pin_hash,
    salt: row.salt,
    displayName: row.display_name,
    role: (row.role === 'admin' ? 'admin' : 'member'),
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

/**
 * Find user by case-insensitive username.
 */
export function findUserByUsername(username: string): UserRecord | null {
  if (!username || typeof username !== 'string') return null;
  const { sqlite } = getDatabase();
  const row = sqlite
    .prepare('SELECT id, username, pin_hash, salt, display_name, role, created_at_ms, updated_at_ms FROM users WHERE username = ? COLLATE NOCASE')
    .get(username.trim()) as DbUserRow | undefined;

  return row ? mapUserRow(row) : null;
}

/**
 * Find user by ID.
 */
export function findUserById(id: string): UserRecord | null {
  if (!id || typeof id !== 'string') return null;
  const { sqlite } = getDatabase();
  const row = sqlite
    .prepare('SELECT id, username, pin_hash, salt, display_name, role, created_at_ms, updated_at_ms FROM users WHERE id = ?')
    .get(id) as DbUserRow | undefined;

  return row ? mapUserRow(row) : null;
}

/**
 * Create a new session for a user in SQLite.
 */
export function createSession(
  userId: string,
  metadata?: { userAgent?: string | null; ipAddress?: string | null; durationMs?: number },
): SessionRecord {
  const { sqlite } = getDatabase();
  const sessionId = generateSessionToken();
  const now = Date.now();
  const duration = metadata?.durationMs || DEFAULT_SESSION_DURATION_MS;
  const expiresAtMs = now + duration;
  const userAgent = metadata?.userAgent || null;
  const ipAddress = metadata?.ipAddress || null;

  sqlite
    .prepare(`
      INSERT INTO sessions (id, user_id, expires_at_ms, created_at_ms, last_active_at_ms, user_agent, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(sessionId, userId, expiresAtMs, now, now, userAgent, ipAddress);

  return {
    id: sessionId,
    userId,
    expiresAtMs,
    createdAtMs: now,
    lastActiveAtMs: now,
    userAgent,
    ipAddress,
  };
}

/**
 * Find active session with user details. Cleans up expired session if found.
 */
export function findSessionWithUser(sessionId: string): AuthenticatedUser | null {
  if (!sessionId || typeof sessionId !== 'string') return null;
  const { sqlite } = getDatabase();
  const now = Date.now();

  const row = sqlite
    .prepare(`
      SELECT 
        s.id AS session_id,
        s.expires_at_ms,
        s.last_active_at_ms,
        u.id AS user_id,
        u.username,
        u.display_name,
        u.role
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `)
    .get(sessionId) as DbSessionUserRow | undefined;

  if (!row) {
    return null;
  }

  // Check if session has expired
  if (row.expires_at_ms <= now) {
    deleteSession(sessionId);
    return null;
  }

  // Sliding update if last active was more than threshold
  if (now - row.last_active_at_ms > SLIDING_ACTIVITY_THRESHOLD_MS) {
    sqlite
      .prepare('UPDATE sessions SET last_active_at_ms = ? WHERE id = ?')
      .run(now, sessionId);
  }

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role === 'admin' ? 'admin' : 'member',
    expiresAtMs: row.expires_at_ms,
  };
}

/**
 * Delete a session (logout).
 */
export function deleteSession(sessionId: string): boolean {
  if (!sessionId) return false;
  const { sqlite } = getDatabase();
  const result = sqlite.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  return result.changes > 0;
}

/**
 * Delete all sessions belonging to a user.
 */
export function deleteUserSessions(userId: string): number {
  if (!userId) return 0;
  const { sqlite } = getDatabase();
  const result = sqlite.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return result.changes;
}

/**
 * Clean up all expired sessions in the background.
 */
export function cleanupExpiredSessions(): number {
  const { sqlite } = getDatabase();
  const now = Date.now();
  const result = sqlite.prepare('DELETE FROM sessions WHERE expires_at_ms <= ?').run(now);
  return result.changes;
}

/**
 * Update user PIN hash and salt.
 */
export function updateUserPin(userId: string, newPinHash: string, newSalt: string): boolean {
  if (!userId || !newPinHash || !newSalt) return false;
  const { sqlite } = getDatabase();
  const now = Date.now();
  const result = sqlite
    .prepare('UPDATE users SET pin_hash = ?, salt = ?, updated_at_ms = ? WHERE id = ?')
    .run(newPinHash, newSalt, now, userId);
  return result.changes > 0;
}

/**
 * List all users for admin management (excluding sensitive credentials).
 */
export function listUsers(): SafeUser[] {
  const { sqlite } = getDatabase();
  const rows = sqlite
    .prepare('SELECT id, username, display_name, role, created_at_ms, updated_at_ms FROM users ORDER BY created_at_ms DESC')
    .all() as Array<{
      id: string;
      username: string;
      display_name: string;
      role: string;
      created_at_ms: number;
      updated_at_ms: number;
    }>;

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role === 'admin' ? 'admin' : 'member',
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  }));
}

/**
 * Create a new user with hashed PIN.
 */
export function createUser(data: {
  username: string;
  pin: string;
  displayName: string;
  role: UserRole;
}): SafeUser {
  const { sqlite } = getDatabase();
  const cleanUsername = data.username.trim();
  const { hash, salt } = hashPin(data.pin);
  const userId = generateUserId(cleanUsername);
  const now = Date.now();

  sqlite
    .prepare(`
      INSERT INTO users (id, username, pin_hash, salt, display_name, role, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(userId, cleanUsername, hash, salt, data.displayName.trim(), data.role, now, now);

  return {
    id: userId,
    username: cleanUsername,
    displayName: data.displayName.trim(),
    role: data.role,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

/**
 * Update user details by admin (displayName, role, and optional reset pin).
 */
export function updateUserByAdmin(
  userId: string,
  data: { pin?: string; role?: UserRole; displayName?: string },
): SafeUser | null {
  const existing = findUserById(userId);
  if (!existing) return null;

  const { sqlite } = getDatabase();
  const now = Date.now();

  let pinHash = existing.pinHash;
  let salt = existing.salt;
  let pinChanged = false;

  if (data.pin) {
    const hashed = hashPin(data.pin);
    pinHash = hashed.hash;
    salt = hashed.salt;
    pinChanged = true;
  }

  const displayName = data.displayName?.trim() || existing.displayName;
  const role = data.role || existing.role;

  sqlite
    .prepare(`
      UPDATE users 
      SET pin_hash = ?, salt = ?, display_name = ?, role = ?, updated_at_ms = ?
      WHERE id = ?
    `)
    .run(pinHash, salt, displayName, role, now, userId);

  // If PIN was reset, invalidate all previous sessions for security
  if (pinChanged) {
    deleteUserSessions(userId);
  }

  return {
    id: userId,
    username: existing.username,
    displayName,
    role,
    createdAtMs: existing.createdAtMs,
    updatedAtMs: now,
  };
}

/**
 * Delete a user and all associated sessions.
 */
export function deleteUser(userId: string): boolean {
  if (!userId) return false;
  const { sqlite } = getDatabase();
  deleteUserSessions(userId);
  const result = sqlite.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return result.changes > 0;
}

