import 'server-only';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDatabase } from '@/server/persistence/database';

export const ANON_COOKIE_NAME = 'chord_anon_token';
export const ANON_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

export interface TrialQuotaStatus {
  allowed: boolean;
  remainingTrials: number;
  usedCount: number;
  trialVideoId: string | null;
  isQuotaExceeded: boolean;
  isAuthenticated?: boolean;
}

interface AnonymousQuotaRow {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  used_count: number;
  trial_video_id: string | null;
  first_used_at_ms: number | null;
  last_used_at_ms: number | null;
  created_at_ms: number;
}

/**
 * Retrieve anonymous token from NextRequest, Request or Next.js cookies() store.
 */
export async function getAnonymousTokenFromRequest(request?: NextRequest | Request): Promise<string | null> {
  if (request) {
    if ('cookies' in request && typeof request.cookies?.get === 'function') {
      const cookie = request.cookies.get(ANON_COOKIE_NAME);
      if (cookie?.value) return cookie.value;
    }

    const rawCookie = request.headers.get('cookie');
    if (rawCookie) {
      const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${ANON_COOKIE_NAME}=([^;]+)`));
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(ANON_COOKIE_NAME);
    return cookie?.value || null;
  } catch {
    return null;
  }
}

/**
 * Extract or generate a persistent anonymous device token.
 */
export async function getOrCreateAnonymousToken(
  request?: NextRequest | Request,
): Promise<{ token: string; isNew: boolean }> {
  const existing = await getAnonymousTokenFromRequest(request);
  if (existing && /^[a-zA-Z0-9_-]{16,64}$/.test(existing)) {
    return { token: existing, isNew: false };
  }

  const newToken = crypto.randomUUID();
  return { token: newToken, isNew: true };
}

/**
 * Set anonymous device token cookie on a NextResponse.
 */
export function setAnonymousTokenCookie(
  response: NextResponse,
  token: string,
  isProduction = process.env.NODE_ENV === 'production',
): void {
  response.cookies.set(ANON_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ANON_COOKIE_MAX_AGE,
    secure: isProduction,
  });
}

/**
 * Check anonymous trial quota for a given token and target videoId.
 * An anonymous user is granted exactly 1 trial song.
 * Re-accessing the SAME trial song is permitted.
 * Attempting to analyze a SECOND song triggers quota exceeded.
 */
export function checkTrialQuota(
  anonToken: string,
  _ipAddress?: string | null,
  targetVideoId?: string,
): TrialQuotaStatus {
  if (!anonToken) {
    return {
      allowed: true,
      remainingTrials: 1,
      usedCount: 0,
      trialVideoId: null,
      isQuotaExceeded: false,
    };
  }

  const { sqlite } = getDatabase();
  const row = sqlite
    .prepare('SELECT id, used_count, trial_video_id FROM anonymous_quotas WHERE id = ?')
    .get(anonToken) as AnonymousQuotaRow | undefined;

  if (!row || row.used_count === 0) {
    return {
      allowed: true,
      remainingTrials: 1,
      usedCount: 0,
      trialVideoId: null,
      isQuotaExceeded: false,
    };
  }

  const usedCount = row.used_count;
  const trialVideoId = row.trial_video_id;

  // If user is accessing the same song they used for their 1 trial
  if (targetVideoId && trialVideoId && targetVideoId === trialVideoId) {
    return {
      allowed: true,
      remainingTrials: 0,
      usedCount,
      trialVideoId,
      isQuotaExceeded: false,
    };
  }

  // Quota exceeded: already used 1 song and now requesting a different one or general check
  return {
    allowed: false,
    remainingTrials: 0,
    usedCount,
    trialVideoId,
    isQuotaExceeded: true,
  };
}

/**
 * Record consumption of trial quota for an anonymous user.
 */
export function consumeTrialQuota(
  anonToken: string,
  videoId: string,
  ipAddress?: string | null,
  userAgent?: string | null,
): void {
  if (!anonToken || !videoId) return;

  const { sqlite } = getDatabase();
  const now = Date.now();

  const existing = sqlite
    .prepare('SELECT id, used_count, trial_video_id FROM anonymous_quotas WHERE id = ?')
    .get(anonToken) as AnonymousQuotaRow | undefined;

  if (!existing) {
    sqlite
      .prepare(`
        INSERT INTO anonymous_quotas (
          id, ip_address, user_agent, used_count, trial_video_id, first_used_at_ms, last_used_at_ms, created_at_ms
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)
      `)
      .run(anonToken, ipAddress || null, userAgent || null, videoId, now, now, now);
  } else {
    // If it's the same song, just touch last_used_at_ms
    if (existing.trial_video_id === videoId) {
      sqlite
        .prepare('UPDATE anonymous_quotas SET last_used_at_ms = ? WHERE id = ?')
        .run(now, anonToken);
    } else if (existing.used_count === 0) {
      sqlite
        .prepare(`
          UPDATE anonymous_quotas 
          SET used_count = 1, trial_video_id = ?, first_used_at_ms = ?, last_used_at_ms = ?
          WHERE id = ?
        `)
        .run(videoId, now, now, anonToken);
    }
  }
}

/**
 * Helper to reset a quota record (useful for tests or admin reset).
 */
export function resetTrialQuota(anonToken: string): boolean {
  if (!anonToken) return false;
  const { sqlite } = getDatabase();
  const result = sqlite.prepare('DELETE FROM anonymous_quotas WHERE id = ?').run(anonToken);
  return result.changes > 0;
}
