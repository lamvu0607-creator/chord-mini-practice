import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/sessionGuard';
import { countGpuJobsAhead, getMelodyJob, toPublicMelodyJob } from '@/server/melody/melodyJobService';
import { getDocument } from '@/server/persistence/documentService';
import type { SheetSageResult } from '@/types/sheetSage';

export const runtime = 'nodejs';

/** Status of a melody v2 job; includes the cached result once it has completed. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { jobId } = await params;
  const job = /^melody_\d+_[0-9a-f-]{36}$/.test(jobId) ? getMelodyJob(jobId) : null;
  if (!job) {
    return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  }

  const data = job.status === 'completed' ? await getDocument<SheetSageResult>('melody', job.videoId) : null;
  return NextResponse.json({
    success: true,
    job: toPublicMelodyJob(job),
    queuePosition: job.status === 'queued' && job.stage !== 'waiting_stems' ? countGpuJobsAhead(job) : 0,
    data: data ?? undefined,
  });
}
