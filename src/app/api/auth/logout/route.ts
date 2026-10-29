import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/server/auth/authRepository';
import { getSessionIdFromRequest, getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/server/auth/sessionGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionId = await getSessionIdFromRequest(request);
    if (sessionId) {
      deleteSession(sessionId);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Đăng xuất thành công',
    });

    // Clear cookie
    const cookieOptions = getSessionCookieOptions();
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      ...cookieOptions,
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Lỗi hệ thống khi đăng xuất',
        },
      },
      { status: 500 },
    );
  }
}
