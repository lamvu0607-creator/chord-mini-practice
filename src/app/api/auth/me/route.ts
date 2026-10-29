import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/server/auth/sessionGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn',
          },
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.userId,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('Check session error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Lỗi hệ thống khi kiểm tra phiên',
        },
      },
      { status: 500 },
    );
  }
}
