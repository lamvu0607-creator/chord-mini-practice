import { NextRequest, NextResponse } from 'next/server';
import { findRecentTranscriptions } from '@/server/persistence/transcriptionRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const rawLimit = Number(request.nextUrl.searchParams.get('limit') || 12);
    const limit = Math.max(1, Math.min(50, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 12));
    return NextResponse.json(findRecentTranscriptions({
      selectedKey: request.nextUrl.searchParams.get('key') || 'all',
      cursor: request.nextUrl.searchParams.get('cursor'),
      limit,
    }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to list recent transcriptions' }, { status: 400 });
  }
}
