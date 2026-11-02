import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/server/auth/sessionGuard';
import { findRecentTranscriptions } from '@/server/persistence/transcriptionRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SEARCH_LENGTH = 120;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const rawLimit = Number(params.get('limit') || 12);
    const limit = Math.max(1, Math.min(50, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 12));
    // Signed-out visitors only ever see YouTube songs and their original titles.
    const isSignedIn = Boolean(await getAuthenticatedUser(request));
    return NextResponse.json(findRecentTranscriptions({
      selectedKey: params.get('key') || 'all',
      cursor: params.get('cursor'),
      limit,
      includeUploads: isSignedIn && params.get('uploads') === '1',
      includeCustomNames: isSignedIn,
      search: (params.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH) || undefined,
    }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to list recent transcriptions' }, { status: 400 });
  }
}
