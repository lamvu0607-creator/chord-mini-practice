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
          message: error instanceof Error ? error.message : 'Lỗi hệ thống khi lấy danh sách người dùng',
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
            message: 'Tên đăng nhập phải từ 3 đến 20 ký tự (chữ cái, số hoặc dấu gạch dưới, không dấu)',
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
            message: pinVal.error || 'Mã PIN phải từ 4 đến 8 chữ số',
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
            message: 'Vui lòng nhập tên hiển thị',
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
            message: `Tên đăng nhập "${username}" đã tồn tại trên hệ thống`,
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
        message: 'Tạo tài khoản người dùng thành công',
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
          message: error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo tài khoản',
        },
      },
      { status: 500 },
    );
  }
}
