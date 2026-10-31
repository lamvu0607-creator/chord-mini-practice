import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthenticatedUser, findSessionWithUser } from './authRepository';

export const SESSION_COOKIE_NAME = 'chord_session_id';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days in seconds

export interface CookieConfig {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
  secure: boolean;
}

export function getSessionCookieOptions(isProduction = process.env.NODE_ENV === 'production') {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: isProduction,
  };
}

/**
 * Extract session token from NextRequest, Request or Next.js cookies() store.
 */
export async function getSessionIdFromRequest(request?: NextRequest | Request): Promise<string | null> {
  if (request) {
    if ('cookies' in request && typeof request.cookies?.get === 'function') {
      const cookie = request.cookies.get(SESSION_COOKIE_NAME);
      if (cookie?.value) return cookie.value;
    }

    // Fallback: parse raw Cookie header
    const rawCookie = request.headers.get('cookie');
    if (rawCookie) {
      const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  // Fallback to Next.js server-side cookies() store
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    return cookie?.value || null;
  } catch {
    return null;
  }
}

/**
 * Retrieve authenticated user from request session cookie.
 */
export async function getAuthenticatedUser(request?: NextRequest | Request): Promise<AuthenticatedUser | null> {
  const sessionId = await getSessionIdFromRequest(request);
  if (!sessionId) {
    return null;
  }
  return findSessionWithUser(sessionId);
}

/**
 * Guard that requires an authenticated user. Returns 401 response if unauthenticated.
 */
export async function requireAuth(
  request?: NextRequest | Request,
): Promise<{ user: AuthenticatedUser; errorResponse?: never } | { user?: never; errorResponse: NextResponse }> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Please sign in to continue',
          },
        },
        { status: 401 },
      ),
    };
  }
  return { user };
}

/**
 * Guard that requires an admin user. Returns 401 or 403 response if unauthorized.
 */
export async function requireAdmin(
  request?: NextRequest | Request,
): Promise<{ user: AuthenticatedUser; errorResponse?: never } | { user?: never; errorResponse: NextResponse }> {
  const auth = await requireAuth(request);
  if (auth.errorResponse) {
    return auth;
  }

  if (auth.user.role !== 'admin') {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Administrator (Admin) access required',
          },
        },
        { status: 403 },
      ),
    };
  }

  return { user: auth.user };
}
