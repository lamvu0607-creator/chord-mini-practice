import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/sessionGuard';
import { deleteUser, findUserById, updateUserByAdmin, UserRole } from '@/server/auth/authRepository';
import { validatePinFormat } from '@/server/auth/pinSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult.errorResponse) {
      return authResult.errorResponse;
    }

    const { userId } = await context.params;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_USER_ID', message: 'Thiếu mã người dùng' } },
        { status: 400 },
      );
    }

    const existing = findUserById(userId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' } },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const pin = typeof body?.pin === 'string' && body.pin.trim() ? body.pin.trim() : undefined;
    const role: UserRole | undefined = body?.role === 'admin' || body?.role === 'member' ? body.role : undefined;
    const displayName = typeof body?.displayName === 'string' && body.displayName.trim() ? body.displayName.trim() : undefined;

    if (pin !== undefined) {
      const pinVal = validatePinFormat(pin);
      if (!pinVal.valid) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PIN_FORMAT',
              message: pinVal.error || 'Mã PIN đặt lại phải từ 4 đến 8 chữ số',
            },
          },
          { status: 400 },
        );
      }
    }

    const updated = updateUserByAdmin(userId, { pin, role, displayName });
    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'UPDATE_FAILED', message: 'Cập nhật thông tin thất bại' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: pin ? 'Đã đặt lại mã PIN và cập nhật tài khoản thành công' : 'Cập nhật tài khoản thành công',
      data: { user: updated },
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật người dùng',
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult.errorResponse) {
      return authResult.errorResponse;
    }

    const { userId } = await context.params;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_USER_ID', message: 'Thiếu mã người dùng' } },
        { status: 400 },
      );
    }

    if (authResult.user.userId === userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CANNOT_DELETE_SELF',
            message: 'Không thể tự xóa tài khoản của chính mình',
          },
        },
        { status: 400 },
      );
    }

    const existing = findUserById(userId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng cần xóa' } },
        { status: 404 },
      );
    }

    const deleted = deleteUser(userId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: 'DELETE_FAILED', message: 'Không thể xóa người dùng' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Đã xóa tài khoản "${existing.username}" thành công`,
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa người dùng',
        },
      },
      { status: 500 },
    );
  }
}
