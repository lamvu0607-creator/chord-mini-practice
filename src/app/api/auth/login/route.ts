import { NextRequest, NextResponse } from 'next/server';
import { findUserByUsername, createSession } from '@/server/auth/authRepository';
import { validatePinFormat, verifyPin } from '@/server/auth/pinSecurity';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/server/auth/sessionGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : String(body?.pin || '');

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_USERNAME',
            message: 'Please enter your username',
          },
        },
        { status: 400 },
      );
    }

    const pinValidation = validatePinFormat(pin);
    if (!pinValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PIN_FORMAT',
            message: pinValidation.error || 'Invalid PIN (4 to 8 digits)',
          },
        },
        { status: 400 },
      );
    }

    const user = findUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Incorrect username or PIN',
          },
        },
        { status: 401 },
      );
    }

    const isPinValid = verifyPin(pin, user.pinHash, user.salt);
    if (!isPinValid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Incorrect username or PIN',
          },
        },
        { status: 401 },
      );
    }

    // Extract metadata
    const userAgent = request.headers.get('user-agent');
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');

    // Create session in SQLite
    const session = createSession(user.id, { userAgent, ipAddress });

    // Prepare response with session cookie
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
      },
      message: 'Signed in',
    });

    const cookieOptions = getSessionCookieOptions();
    response.cookies.set(SESSION_COOKIE_NAME, session.id, cookieOptions);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Server error while signing in',
        },
      },
      { status: 500 },
    );
  }
}
