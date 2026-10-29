/**
 * Short-lived in-process audio cache used while analysis requests are assembled.
 * Durable audio lives in storage/audio and is tracked by SQLite.
 */
export interface ParallelPipelineOptions {
  videoId: string;
  title: string;
  directUrl: string;
  contentType?: string;
}

export interface ParallelPipelineResult {
  success: boolean;
  directUrl: string;
  error?: string;
  hasCompleteFile: boolean;
}

interface CachedAudio {
  blob: Blob;
  timestamp: number;
  contentType: string;
}

const AUDIO_CACHE_TTL_MS = 10 * 60 * 1000;
const audioFileCache = new Map<string, CachedAudio>();

export async function startParallelPipeline(
  options: ParallelPipelineOptions,
): Promise<ParallelPipelineResult> {
  try {
    const response = await fetch(options.directUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Unable to download audio: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    audioFileCache.set(options.videoId, {
      blob,
      timestamp: Date.now(),
      contentType: options.contentType ?? blob.type ?? 'audio/mp4',
    });

    return { success: true, directUrl: options.directUrl, hasCompleteFile: true };
  } catch (error) {
    return {
      success: false,
      directUrl: options.directUrl,
      hasCompleteFile: false,
      error: error instanceof Error ? error.message : 'Unable to prepare audio',
    };
  }
}

export function getCachedAudioFile(videoId: string): Blob | null {
  const cached = audioFileCache.get(videoId);
  if (!cached) return null;
  if (Date.now() - cached.timestamp >= AUDIO_CACHE_TTL_MS) {
    audioFileCache.delete(videoId);
    return null;
  }
  return cached.blob;
}

export function getCachedAudioMeta(videoId: string): {
  present: boolean;
  ageMs?: number;
  size?: number;
  timestamp?: number;
  expiresInMs?: number;
} {
  const cached = audioFileCache.get(videoId);
  if (!cached) return { present: false };
  const ageMs = Date.now() - cached.timestamp;
  return {
    present: ageMs < AUDIO_CACHE_TTL_MS,
    ageMs,
    size: cached.blob.size,
    timestamp: cached.timestamp,
    expiresInMs: Math.max(0, AUDIO_CACHE_TTL_MS - ageMs),
  };
}

export function cleanupBackgroundResults(maxAgeMs = AUDIO_CACHE_TTL_MS): void {
  const now = Date.now();
  for (const [videoId, cached] of audioFileCache) {
    if (now - cached.timestamp >= maxAgeMs) audioFileCache.delete(videoId);
  }
}

export function canUseDirectUrlWithBackend(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function getBackendEndpointForDirectUrl(processingType: 'beats' | 'chords'): string {
  return processingType === 'beats' ? '/api/detect-beats' : '/api/recognize-chords';
}
