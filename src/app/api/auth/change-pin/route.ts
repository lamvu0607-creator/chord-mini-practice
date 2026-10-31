import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/sessionGuard';
import { findUserById, updateUserPin } from '@/server/auth/authRepository';
import { hashPin, validatePinFormat, verifyPin } from '@/server/auth/pinSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.errorResponse) {
      return authResult.errorResponse;
    }

    const { user } = authResult;
    const body = await request.json().catch(() => ({}));
    const oldPin = typeof body?.oldPin === 'string' ? body.oldPin.trim() : String(body?.oldPin || '');
    const newPin = typeof body?.newPin === 'string' ? body.newPin.trim() : String(body?.newPin || '');

    const oldPinVal = validatePinFormat(oldPin);
    if (!oldPinVal.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PIN_FORMAT',
            message: 'Current PIN is invalid (4 to 8 digits)',
          },
        },
        { status: 400 },
      );
    }

    const newPinVal = validatePinFormat(newPin);
    if (!newPinVal.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PIN_FORMAT',
            message: newPinVal.error || 'The new PIN must be 4 to 8 digits',
          },
        },
        { status: 400 },
      );
    }

    if (oldPin === newPin) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SAME_PIN',
            message: 'The new PIN must differ from the current PIN',
          },
        },
        { status: 400 },
      );
    }

    const dbUser = findUserById(user.userId);
    if (!dbUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Account not found',
          },
        },
        { status: 404 },
      );
    }

    const isOldPinValid = verifyPin(oldPin, dbUser.pinHash, dbUser.salt);
    if (!isOldPinValid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_OLD_PIN',
            message: 'Current PIN is incorrect',
          },
        },
        { status: 400 },
      );
    }

    const { hash: newPinHash, salt: newSalt } = hashPin(newPin);
    updateUserPin(user.userId, newPinHash, newSalt);

    return NextResponse.json({
      success: true,
      message: 'PIN changed',
    });
  } catch (error) {
    console.error('Change PIN error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Server error while changing the PIN',
        },
      },
      { status: 500 },
    );
  }
}
