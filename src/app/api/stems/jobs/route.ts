import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/sessionGuard';
import { countActiveStemJobsForUser, createStemJob, findActiveStemJob, toPublicStemJob } from '@/server/stems/stemJobService';
import { getStemSet, toPublicStemSet } from '@/server/stems/stemSetRepository';
import { isValidSourceId } from '@/server/stems/stemStorage';
import { startStemWorker } from '@/server/stems/stemWorker';
import { resolveYouTubeStemSource } from '@/server/stems/youtubeStemSource';

export const runtime = 'nodejs';

const MAX_ACTIVE_JOBS_PER_USER = 2;
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

/**
 * Queue stem separation for a cached YouTube song (`{ videoId }`) or an upload (`{ sourceId }`).
 * Returns the finished set immediately when it already exists.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user } = auth;

  const body = (await request.json().catch(() => null)) as { videoId?: unknown; sourceId?: unknown; title?: unknown } | null;
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) || undefined : undefined;

  let sourceId: string;
  let inputPath: string;

  if (typeof body?.videoId === 'string') {
    const videoId = body.videoId.trim();
    if (!VIDEO_ID_PATTERN.test(videoId)) return error('Invalid YouTube video id', 400);
    const source = await resolveYouTubeStemSource(videoId, title);
    if (!source) {
      return error('Audio for this video is not cached yet. Extract it first.', 409, 'AUDIO_NOT_CACHED');
    }
    ({ sourceId, inputPath } = source);
  } else if (typeof body?.sourceId === 'string') {
    sourceId = body.sourceId.trim();
    const record = isValidSourceId(sourceId) ? getStemSet(sourceId) : null;
    if (!record || record.sourceType !== 'upload') return error('Upload not found', 404);
    if (record.ownerUserId !== user.userId && user.role !== 'admin') return error('Upload not found', 404);
    inputPath = record.inputPath;
  } else {
    return error('Provide videoId or sourceId', 400);
  }

  const existing = getStemSet(sourceId);
  if (existing?.status === 'ready') {
    return NextResponse.json({ success: true, stemSet: toPublicStemSet(existing, user) });
  }

  const active = findActiveStemJob(sourceId);
  if (active) return NextResponse.json({ success: true, job: toPublicStemJob(active) });

  if (user.role !== 'admin' && countActiveStemJobsForUser(user.userId) >= MAX_ACTIVE_JOBS_PER_USER) {
    return error(`You already have ${MAX_ACTIVE_JOBS_PER_USER} separations in progress. Wait for one to finish.`, 429, 'TOO_MANY_JOBS');
  }

  const job = createStemJob({ sourceId, inputPath, requestedBy: user.userId });
  startStemWorker();
  return NextResponse.json({ success: true, job: toPublicStemJob(job) }, { status: 202 });
}
