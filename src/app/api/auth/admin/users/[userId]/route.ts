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
        { success: false, error: { code: 'MISSING_USER_ID', message: 'Missing user ID' } },
        { status: 400 },
      );
    }

    const existing = findUserById(userId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } },
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
              message: pinVal.error || 'The new PIN must be 4 to 8 digits',
            },
          },
          { status: 400 },
        );
      }
    }

    const updated = updateUserByAdmin(userId, { pin, role, displayName });
    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'UPDATE_FAILED', message: 'Update failed' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: pin ? 'PIN reset and account updated' : 'Account updated',
      data: { user: updated },
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Server error while updating the user',
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
        { success: false, error: { code: 'MISSING_USER_ID', message: 'Missing user ID' } },
        { status: 400 },
      );
    }

    if (authResult.user.userId === userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CANNOT_DELETE_SELF',
            message: 'You cannot delete your own account',
          },
        },
        { status: 400 },
      );
    }

    const existing = findUserById(userId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: 'User to delete not found' } },
        { status: 404 },
      );
    }

    const deleted = deleteUser(userId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: 'DELETE_FAILED', message: 'Could not delete the user' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Account "${existing.username}" deleted`,
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Server error while deleting the user',
        },
      },
      { status: 500 },
    );
  }
}
