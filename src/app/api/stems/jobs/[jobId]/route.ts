import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/server/auth/sessionGuard';
import { countJobsAhead, getStemJob, toPublicStemJob } from '@/server/stems/stemJobService';
import { canViewStemSet, getStemSet, toPublicStemSet } from '@/server/stems/stemSetRepository';
import { stemsBackendUrl } from '@/server/stems/stemWorker';

export const runtime = 'nodejs';

async function fetchLiveProgress(jobId: string): Promise<number | undefined> {
  try {
    const response = await fetch(`${stemsBackendUrl()}/progress/${encodeURIComponent(jobId)}`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { progress?: number };
    return typeof payload.progress === 'number' ? payload.progress : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = /^stem_\d+_[0-9a-f-]{36}$/.test(jobId) ? getStemJob(jobId) : null;
  const user = await getAuthenticatedUser(request);
  const record = job ? getStemSet(job.sourceId) : null;
  if (!job || !record || !canViewStemSet(record, user)) {
    return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  }

  const progress = job.status === 'processing' ? await fetchLiveProgress(job.jobId) : undefined;
  return NextResponse.json({
    success: true,
    job: toPublicStemJob(job, progress),
    queuePosition: job.status === 'queued' ? countJobsAhead(job) : 0,
    stemSet: record.status === 'ready' ? toPublicStemSet(record, user) : undefined,
  });
}
