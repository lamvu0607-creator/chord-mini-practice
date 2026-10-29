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
            message: 'Mã PIN hiện tại không hợp lệ (4 - 8 số)',
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
            message: newPinVal.error || 'Mã PIN mới phải từ 4 đến 8 chữ số',
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
            message: 'Mã PIN mới không được trùng với mã PIN hiện tại',
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
            message: 'Không tìm thấy thông tin tài khoản',
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
            message: 'Mã PIN hiện tại không chính xác',
          },
        },
        { status: 400 },
      );
    }

    const { hash: newPinHash, salt: newSalt } = hashPin(newPin);
    updateUserPin(user.userId, newPinHash, newSalt);

    return NextResponse.json({
      success: true,
      message: 'Đổi mã PIN thành công',
    });
  } catch (error) {
    console.error('Change PIN error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Lỗi hệ thống khi đổi mã PIN',
        },
      },
      { status: 500 },
    );
  }
}
