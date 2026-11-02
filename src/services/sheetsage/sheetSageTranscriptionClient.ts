import type { MelodyJob, MelodyJobStage, SheetSageResult } from '@/types/sheetSage';
import { getCachedSheetSageMelody } from '@/services/sheetsage/sheetSageCacheClient';
import { buildAudioProxyUrl } from '@/utils/audioProxyUrl';
import { isLocalBackend } from '@/utils/backendConfig';

const SHEETSAGE_CACHE_RECOVERY_ATTEMPTS = 30;
const SHEETSAGE_CACHE_RECOVERY_DELAY_MS = 3000;

function buildSourceFilename(sourceName: string | undefined | null): string {
  const baseName = (sourceName || 'sheetsage-input').replace(/[^\w.-]+/g, '_');
  return baseName.endsWith('.mp3') || baseName.endsWith('.wav') || baseName.endsWith('.flac') || baseName.endsWith('.ogg') || baseName.endsWith('.m4a')
    ? baseName
    : `${baseName}.mp3`;
}

async function buildSheetSageRequestHeaders(contentType?: string): Promise<HeadersInit> {
  const headers: HeadersInit = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecoverableSheetSageDisconnect(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes('network connection was lost')
    || message.includes('failed to fetch')
    || message.includes('load failed')
    || message.includes('networkerror')
    || message.includes('terminated')
    || message.includes('aborted')
    || message.includes('timeout')
  );
}

async function recoverSheetSageResultFromCache(
  videoId: string | null | undefined,
  originalError: unknown,
): Promise<SheetSageResult> {
  const normalizedVideoId = videoId?.trim();

  if (!normalizedVideoId || !isRecoverableSheetSageDisconnect(originalError)) {
    throw originalError;
  }

  let lastCacheError: unknown = null;

  for (let attempt = 0; attempt < SHEETSAGE_CACHE_RECOVERY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await delay(SHEETSAGE_CACHE_RECOVERY_DELAY_MS);
    }

    try {
      const cachedResult = await getCachedSheetSageMelody(normalizedVideoId);
      if (cachedResult) {
        return cachedResult;
      }
    } catch (cacheError) {
      lastCacheError = cacheError;
    }
  }

  if (lastCacheError) {
    console.warn('Sheet Sage cache recovery did not find a completed result:', lastCacheError);
  }

  throw originalError;
}

export async function resolveSheetSageAudioFile(
  audioFile: File | null | undefined,
  audioUrl: string | null | undefined,
  videoId?: string | null,
): Promise<File> {
  if (audioFile) {
    return audioFile;
  }

  if (!audioUrl) {
    throw new Error('No audio source available for Sheet Sage');
  }

  const fetchUrl = audioUrl.startsWith('blob:')
    ? audioUrl
    : buildAudioProxyUrl(audioUrl, { videoId });

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio source: ${response.status} ${response.statusText}`);
  }

  const audioBlob = await response.blob();
  const filename = buildSourceFilename(audioUrl.split('/').pop());
  return new File([audioBlob], filename, {
    type: audioBlob.type || 'audio/mpeg',
  });
}

export async function requestSheetSageTranscription(
  audioFile: File | null | undefined,
  audioUrl: string | null | undefined,
  videoId?: string | null,
): Promise<SheetSageResult> {
  try {
    const shouldUseDirectAudioUrl = (
      !audioFile
      && typeof audioUrl === 'string'
      && !isLocalBackend()
    );

    if (shouldUseDirectAudioUrl) {
      const response = await fetch('/api/transcribe-sheetsage', {
        method: 'POST',
        headers: await buildSheetSageRequestHeaders('application/json'),
        body: JSON.stringify({
          audioUrl,
          videoId: videoId || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload?.data) {
        throw new Error(payload?.error || 'Sheet Sage transcription failed');
      }

      return payload.data as SheetSageResult;
    }

    const sourceFile = await resolveSheetSageAudioFile(audioFile, audioUrl, videoId);

    const formData = new FormData();
    formData.append('file', sourceFile, sourceFile.name);
    if (videoId) {
      formData.append('videoId', videoId);
    }

    const response = await fetch('/api/transcribe-sheetsage', {
      method: 'POST',
      headers: await buildSheetSageRequestHeaders(),
      body: formData,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !payload?.data) {
      throw new Error(payload?.error || 'Sheet Sage transcription failed');
    }

    return payload.data as SheetSageResult;
  } catch (error) {
    return recoverSheetSageResultFromCache(videoId, error);
  }
}

const MELODY_JOB_POLL_MS = 2000;

/** Melody v2 needs a signed-in user (it queues a stem separation on the GPU). */
export class MelodyAuthRequiredError extends Error {
  constructor() {
    super('Sign in to transcribe the melody from the vocal stem and MuScriptor.');
    this.name = 'MelodyAuthRequiredError';
  }
}

export interface MelodyJobUpdate {
  stage: MelodyJobStage;
  progress?: number | null;
  queuePosition?: number;
}

/**
 * Melody v2: vocal line from the SCNet vocals stem + instrument notes from MuScriptor, computed by a
 * background job. Resolves with the result, or `null` when the source ID is not supported,
 * so the caller can fall back to {@link requestSheetSageTranscription}.
 */
export async function requestMelodyV2Transcription(
  videoId: string,
  onUpdate?: (update: MelodyJobUpdate) => void,
  isCancelled: () => boolean = () => false,
): Promise<SheetSageResult | null> {
  const response = await fetch('/api/transcribe-sheetsage', {
    method: 'POST',
    headers: await buildSheetSageRequestHeaders('application/json'),
    body: JSON.stringify({ videoId, pipeline: 'v2' }),
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 401) throw new MelodyAuthRequiredError();
  if (response.status === 400 && payload?.code === 'UNSUPPORTED_SOURCE') return null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `Melody transcription failed (${response.status})`);
  }
  if (payload.data) return payload.data as SheetSageResult;

  const job = payload.job as MelodyJob | undefined;
  if (!job?.jobId) throw new Error('Melody transcription did not return a job');
  onUpdate?.({ stage: job.stage, progress: job.progress });

  while (!isCancelled()) {
    await delay(MELODY_JOB_POLL_MS);
    if (isCancelled()) break;
    const poll = await fetch(`/api/transcribe-sheetsage/jobs/${encodeURIComponent(job.jobId)}`, { cache: 'no-store' });
    const status = await poll.json().catch(() => null);
    if (poll.status === 401) throw new MelodyAuthRequiredError();
    if (!poll.ok || !status?.success || !status.job) {
      throw new Error(status?.error || `Melody job lookup failed (${poll.status})`);
    }
    const current = status.job as MelodyJob;
    if (current.status === 'failed') throw new Error(current.error || 'Melody transcription failed');
    if (current.status === 'completed') {
      if (!status.data) throw new Error('Melody job finished without a result');
      return status.data as SheetSageResult;
    }
    onUpdate?.({ stage: current.stage, progress: current.progress, queuePosition: status.queuePosition });
  }
  throw new Error('Melody transcription cancelled');
}
