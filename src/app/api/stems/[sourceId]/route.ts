import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/server/auth/sessionGuard';
import { findActiveStemJob } from '@/server/stems/stemJobService';
import {
  canDeleteStemSet,
  canViewStemSet,
  deleteStemSetRow,
  getStemSet,
  toPublicStemSet,
  touchStemSet,
} from '@/server/stems/stemSetRepository';
import { isValidSourceId, removeStemDir } from '@/server/stems/stemStorage';

export const runtime = 'nodejs';

type Params = { params: Promise<{ sourceId: string }> };

async function loadVisible(request: NextRequest, params: Params['params']) {
  const { sourceId } = await params;
  const user = await getAuthenticatedUser(request);
  const record = isValidSourceId(sourceId) ? getStemSet(sourceId) : null;
  return { user, record: record && canViewStemSet(record, user) ? record : null };
}

export async function GET(request: NextRequest, { params }: Params) {
  const { user, record } = await loadVisible(request, params);
  if (!record) return NextResponse.json({ success: false, error: 'Stems not found' }, { status: 404 });
  if (record.status === 'ready') touchStemSet(record.sourceId);
  const activeJob = findActiveStemJob(record.sourceId);
  return NextResponse.json({ success: true, stemSet: toPublicStemSet(record, user), activeJobId: activeJob?.jobId ?? null });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { user, record } = await loadVisible(request, params);
  if (!record) return NextResponse.json({ success: false, error: 'Stems not found' }, { status: 404 });
  if (!canDeleteStemSet(record, user)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  if (findActiveStemJob(record.sourceId)) {
    return NextResponse.json({ success: false, error: 'Separation still running' }, { status: 409 });
  }
  try {
    await removeStemDir(record.sourceId);
  } catch (error) {
    console.error(`Failed to delete stems for ${record.sourceId}:`, error);
    return NextResponse.json({ success: false, error: 'Could not delete the stem files on the server.' }, { status: 500 });
  }
  deleteStemSetRow(record.sourceId);
  return NextResponse.json({ success: true });
}
