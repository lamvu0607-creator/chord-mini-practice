import { NextRequest, NextResponse } from 'next/server';
import { getSheetSageApiUrl } from '@/config/serverBackend';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { MELODY_PIPELINE_VERSION, type SheetSageResult } from '@/types/sheetSage';
import { getDocument, setDocument } from '@/server/persistence/documentService';
import { validateAudioSourceUrl } from '@/utils/audioSourceValidation';
import { getAuthenticatedUser, requireAuth } from '@/server/auth/sessionGuard';
import { checkTrialQuota, getOrCreateAnonymousToken } from '@/server/auth/quotaGuard';
import { isUploadSourceId } from '@/utils/uploadSourceId';
import {
  countActiveMelodyJobsForUser,
  createMelodyJob,
  findActiveMelodyJob,
  toPublicMelodyJob,
} from '@/server/melody/melodyJobService';
import { normalizeMelodyResultForCache } from '@/server/melody/melodyResult';
import { startStemWorker } from '@/server/stems/stemWorker';
import { resolveUploadStemSource } from '@/server/stems/uploadStemSource';
import { resolveYouTubeStemSource } from '@/server/stems/youtubeStemSource';

export const maxDuration = 300;

const DEFAULT_SHEETSAGE_BACKEND_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_SHEETSAGE_HEALTH_TIMEOUT_MS = 20 * 1000;
const parsedSheetSageBackendTimeoutMs = Number(
  process.env.SHEETSAGE_BACKEND_TIMEOUT_MS || DEFAULT_SHEETSAGE_BACKEND_TIMEOUT_MS,
);
const SHEETSAGE_BACKEND_TIMEOUT_MS = (
  Number.isFinite(parsedSheetSageBackendTimeoutMs)
    && parsedSheetSageBackendTimeoutMs > 0
)
  ? Math.floor(parsedSheetSageBackendTimeoutMs)
  : DEFAULT_SHEETSAGE_BACKEND_TIMEOUT_MS;

function buildBackendUnavailableMessage(message: string): string {
  if (message.toLowerCase().includes('required upstream assets') || message.toLowerCase().includes('asset host')) {
    return 'Sheet Sage backend unavailable: missing upstream assets.';
  }

  return message;
}

function isValidVideoId(videoId: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId) || isUploadSourceId(videoId);
}

function readStringField(formData: FormData, ...names: string[]): string | null {
  for (const name of names) {
    const value = formData.get(name);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

type SheetSageAudioSource = {
  file?: File;
  audioUrl?: string;
};

async function resolveAudioSourceFromFormData(formData: FormData): Promise<SheetSageAudioSource> {
  const file = formData.get('file');
  if (file instanceof File) {
    return { file };
  }

  const remoteUrlEntry = readStringField(formData, 'audioUrl');
  if (!remoteUrlEntry) {
    throw new Error('No audio file provided');
  }

  return { audioUrl: validateAudioSourceUrl(remoteUrlEntry) };
}

function getJsonString(payload: unknown, ...names: string[]): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function resolveAudioSourceFromJson(payload: unknown): SheetSageAudioSource {
  const remoteUrlEntry = getJsonString(payload, 'audioUrl');
  if (!remoteUrlEntry) {
    throw new Error('No audio file provided');
  }

  return {
    audioUrl: validateAudioSourceUrl(remoteUrlEntry),
  };
}

const MAX_ACTIVE_MELODY_JOBS_PER_USER = 2;
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Melody v2 (`{ videoId, pipeline: 'v2' }`): vocal line from the SCNet vocals stem, instrument notes from
 * MuScriptor. Returns the cached v2 result, or queues a background job (separating stems first if needed).
 */
async function handleMelodyV2(request: NextRequest, videoId: string) {
  const isUpload = isUploadSourceId(videoId);
  if (!isUpload && !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return NextResponse.json(
      { success: false, error: 'Melody v2 only supports cached YouTube songs and uploads', code: 'UNSUPPORTED_SOURCE' },
      { status: 400 },
    );
  }

  const cached = await getDocument<SheetSageResult>('melody', videoId);
  if (cached?.pipelineVersion === MELODY_PIPELINE_VERSION) {
    return NextResponse.json({ success: true, data: cached });
  }

  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user } = auth;

  const active = findActiveMelodyJob(videoId);
  if (active) {
    startStemWorker();
    return NextResponse.json({ success: true, job: toPublicMelodyJob(active) }, { status: 202 });
  }
  if (user.role !== 'admin' && countActiveMelodyJobsForUser(user.userId) >= MAX_ACTIVE_MELODY_JOBS_PER_USER) {
    return NextResponse.json(
      { success: false, error: `You already have ${MAX_ACTIVE_MELODY_JOBS_PER_USER} melody transcriptions in progress.`, code: 'TOO_MANY_JOBS' },
      { status: 429 },
    );
  }

  const source = isUpload
    ? await resolveUploadStemSource(videoId, user.userId)
    : await resolveYouTubeStemSource(videoId);
  if (!source) {
    return NextResponse.json(
      {
        success: false,
        error: isUpload ? 'This audio file is no longer on the server.' : 'Audio for this video is not cached yet. Extract it first.',
        code: 'AUDIO_NOT_CACHED',
      },
      { status: 409 },
    );
  }

  const job = createMelodyJob({ videoId, sourceId: source.sourceId, inputPath: source.inputPath, requestedBy: user.userId });
  startStemWorker();
  return NextResponse.json({ success: true, job: toPublicMelodyJob(job) }, { status: 202 });
}

export async function POST(request: NextRequest) {
  const backendUrl = getSheetSageApiUrl();

  try {
    const contentType = request.headers.get('content-type') || '';
    const isJsonRequest = contentType.toLowerCase().includes('application/json');
    const requestPayload = isJsonRequest ? await request.json().catch(() => null) : null;
    if (getJsonString(requestPayload, 'pipeline') === 'v2') {
      return await handleMelodyV2(request, getJsonString(requestPayload, 'videoId') ?? '');
    }
    const formData = isJsonRequest ? null : await request.formData();
    const videoIdField = isJsonRequest
      ? getJsonString(requestPayload, 'videoId')
      : formData?.get('videoId');
    const videoId = typeof videoIdField === 'string' ? videoIdField.trim() : '';

    // Quota guard check for anonymous users
    const authUser = await getAuthenticatedUser(request);
    if (!authUser && videoId) {
      const { token: anonToken } = await getOrCreateAnonymousToken(request);
      const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip');
      const quotaCheck = checkTrialQuota(anonToken, ipAddress, videoId);
      if (!quotaCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: 'You have used your 1 free trial. Please sign in to use melody transcription.',
          },
          { status: 403 },
        );
      }
    }

    let audioSource: SheetSageAudioSource;
    try {
      audioSource = isJsonRequest
        ? resolveAudioSourceFromJson(requestPayload)
        : await resolveAudioSourceFromFormData(formData as FormData);
    } catch (resolveError) {
      return NextResponse.json(
        {
          success: false,
          error: resolveError instanceof Error ? resolveError.message : 'No audio file provided',
        },
        { status: 400 },
      );
    }

    const modeField = isJsonRequest
      ? (requestPayload && typeof requestPayload === 'object' && 'mode' in requestPayload && typeof requestPayload.mode === 'string' ? requestPayload.mode : null)
      : (formData instanceof FormData ? readStringField(formData, 'mode') : null);
    const mode = (typeof modeField === 'string' && modeField.trim()) ? modeField.trim().toLowerCase() : 'vocal';

    const backendRequest = audioSource.audioUrl
      ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: audioSource.audioUrl, mode }),
        signal: createSafeTimeoutSignal(SHEETSAGE_BACKEND_TIMEOUT_MS),
      }
      : (() => {
        const backendFormData = new FormData();
        backendFormData.append('file', audioSource.file as File, audioSource.file?.name || 'audio-upload');
        backendFormData.append('mode', mode);
        return {
          method: 'POST',
          body: backendFormData,
          signal: createSafeTimeoutSignal(SHEETSAGE_BACKEND_TIMEOUT_MS),
        };
      })();

    const response = await fetch(`${backendUrl}/transcribe`, {
      ...backendRequest,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.error || `Sheet Sage backend failed: ${response.status} ${response.statusText}`,
        },
        { status: response.status },
      );
    }

    if (videoId && isValidVideoId(videoId) && payload?.data) {
      try {
        const sanitizedData = normalizeMelodyResultForCache(videoId, payload.data as SheetSageResult);
        await setDocument('melody', videoId, sanitizedData);
        console.log(`🎻 [API] Cached Sheet Sage melody for ${videoId} (${sanitizedData.noteEventCount} notes)`);
      } catch (cacheError) {
        console.error('❌ [API] Failed to persist Sheet Sage melody cache:', cacheError);
      }
    }

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Sheet Sage error';
    const isFetchFailure = message.toLowerCase().includes('fetch failed');
    const isTimeoutFailure = message.toLowerCase().includes('aborted')
      || message.toLowerCase().includes('timeout');

    return NextResponse.json(
      {
        success: false,
        error: isFetchFailure
          ? 'Could not reach the Sheet Sage backend. Please try again later or contact support if the issue persists.'
          : isTimeoutFailure
            ? `Sheet Sage exceeded the ${Math.round(SHEETSAGE_BACKEND_TIMEOUT_MS / 1000)}s proxy timeout. Increase SHEETSAGE_BACKEND_TIMEOUT_MS or try a shorter audio segment.`
            : message,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const healthRequested = request.nextUrl.searchParams.get('health');
  if (healthRequested === '1' || healthRequested === 'true') {
    const backendUrl = getSheetSageApiUrl();

    try {
      const response = await fetch(`${backendUrl}/health?warmup=true`, {
        method: 'GET',
        signal: createSafeTimeoutSignal(DEFAULT_SHEETSAGE_HEALTH_TIMEOUT_MS),
      });

      const payload = await response.json().catch(() => null);
      const backendError = payload?.error || `Sheet Sage backend health check failed: ${response.status} ${response.statusText}`;
      const normalizedError = buildBackendUnavailableMessage(backendError);

      return NextResponse.json(
        {
          success: response.ok,
          available: response.ok && payload?.assetUnavailable !== true,
          initialized: Boolean(payload?.initialized),
          assetUnavailable: Boolean(payload?.assetUnavailable),
          error: response.ok ? null : normalizedError,
          statusCode: response.status,
          runtime: payload?.runtime ?? null,
        },
        { status: 200 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown Sheet Sage health error';
      const isFetchFailure = message.toLowerCase().includes('fetch failed');
      const isTimeoutFailure = message.toLowerCase().includes('aborted')
        || message.toLowerCase().includes('timeout');

      return NextResponse.json(
        {
          success: false,
          available: false,
          assetUnavailable: false,
          error: isFetchFailure
            ? 'Could not reach the Sheet Sage backend.'
            : isTimeoutFailure
              ? 'Timed out while checking Sheet Sage backend readiness.'
              : message,
          statusCode: 503,
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({
    name: 'Sheet Sage API',
    description: 'Proxies uploaded audio to the standalone Sheet Sage melody backend.',
    endpoint: 'POST /api/transcribe-sheetsage',
  });
}
