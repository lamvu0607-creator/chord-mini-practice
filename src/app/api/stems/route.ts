import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/server/auth/sessionGuard';
import { listVisibleStemSets, toPublicStemSet } from '@/server/stems/stemSetRepository';

export const runtime = 'nodejs';

/** Ready stem sets the viewer may open: every YouTube set plus their own uploads. */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  const stemSets = listVisibleStemSets(user).map((record) => toPublicStemSet(record, user));
  return NextResponse.json({ success: true, stemSets, signedIn: Boolean(user) });
}
