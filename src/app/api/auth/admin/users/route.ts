import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/sessionGuard';
import { createUser, findUserByUsername, listUsers, UserRole } from '@/server/auth/authRepository';
import { validatePinFormat } from '@/server/auth/pinSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult.errorResponse) {
      return authResult.errorResponse;
    }

    const users = listUsers();
    return NextResponse.json({
      success: true,
      data: { users },
    });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Server error while listing users',
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult.errorResponse) {
      return authResult.errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : String(body?.pin || '');
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : username;
    const role: UserRole = body?.role === 'admin' ? 'admin' : 'member';

    if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_USERNAME',
            message: 'Username must be 3 to 20 characters (letters, digits or underscores)',
          },
        },
        { status: 400 },
      );
    }

    const pinVal = validatePinFormat(pin);
    if (!pinVal.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PIN_FORMAT',
            message: pinVal.error || 'PIN must be 4 to 8 digits',
          },
        },
        { status: 400 },
      );
    }

    if (!displayName) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_DISPLAY_NAME',
            message: 'Please enter a display name',
          },
        },
        { status: 400 },
      );
    }

    const existing = findUserByUsername(username);
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: `Username "${username}" already exists`,
          },
        },
        { status: 409 },
      );
    }

    const newUser = createUser({
      username,
      pin,
      displayName,
      role,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'User account created',
        data: { user: newUser },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Server error while creating the account',
        },
      },
      { status: 500 },
    );
  }
}
