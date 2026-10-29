import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/server/auth/sessionGuard';
import {
  checkTrialQuota,
  getOrCreateAnonymousToken,
  setAnonymousTokenCookie,
} from '@/server/auth/quotaGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (user) {
      return NextResponse.json({
        success: true,
        data: {
          isAuthenticated: true,
          role: user.role,
          remainingTrials: 999999,
          usedCount: 0,
          trialVideoId: null,
          isQuotaExceeded: false,
        },
      });
    }

    const { token: anonToken, isNew } = await getOrCreateAnonymousToken(request);
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip');
    const quota = checkTrialQuota(anonToken, ipAddress);

    const response = NextResponse.json({
      success: true,
      data: {
        isAuthenticated: false,
        role: null,
        remainingTrials: quota.remainingTrials,
        usedCount: quota.usedCount,
        trialVideoId: quota.trialVideoId,
        isQuotaExceeded: quota.isQuotaExceeded,
      },
    });

    if (isNew) {
      setAnonymousTokenCookie(response, anonToken);
    }

    return response;
  } catch (error) {
    console.error('Check quota error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Lỗi hệ thống khi kiểm tra hạn mức',
        },
      },
      { status: 500 },
    );
  }
}
