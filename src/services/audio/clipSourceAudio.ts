/**
 * Loads the full audio of an analyze-page source (YouTube video or uploaded file)
 * into the browser so a clip can be cut from it.
 * YouTube audio goes through the normal extraction route (quota, local cache,
 * server yt-dlp); uploaded audio is already stored and is read back directly.
 */

import { getCachedAudioFile } from '@/services/api/parallelPipelineService';
import { isUploadSourceId } from '@/utils/uploadSourceId';

export interface ClipSourceAudio {
  file: File;
  title: string;
  videoId: string;
}

interface ExtractAudioResponse {
  success?: boolean;
  title?: string;
  requiresBrowserExtraction?: boolean;
  error?: string | { message?: string };
  details?: string;
}

function extensionFor(type: string): string {
  if (type.includes('webm')) return 'webm';
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  if (type.includes('wav')) return 'wav';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('flac')) return 'flac';
  return 'mp3';
}

function toFile(blob: Blob, title: string): File {
  const type = blob.type || 'audio/mpeg';
  const safeTitle = title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'audio';
  return new File([blob], `${safeTitle}.${extensionFor(type)}`, { type });
}

function errorMessage(body: ExtractAudioResponse, status: number): string {
  if (typeof body.error === 'object' && body.error?.message) return body.error.message;
  if (typeof body.error === 'string') return body.details ? `${body.error}: ${body.details}` : body.error;
  return `Không tải được audio từ YouTube (${status}).`;
}

async function ensureYouTubeAudioExtracted(videoId: string, knownTitle?: string): Promise<string | undefined> {
  const extractResponse = await fetch('/api/extract-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, originalTitle: knownTitle }),
  });
  const body = await extractResponse.json().catch(() => ({})) as ExtractAudioResponse;
  if (body.requiresBrowserExtraction) {
    throw new Error('Server chưa bật tải audio YouTube (NEXT_PUBLIC_AUDIO_STRATEGY phải là "ytdlp").');
  }
  if (!extractResponse.ok || !body.success) {
    throw new Error(errorMessage(body, extractResponse.status));
  }
  return body.title;
}

export async function loadSourceAudioForClip(videoId: string, knownTitle?: string): Promise<ClipSourceAudio> {
  const cached = getCachedAudioFile(videoId);
  if (cached) {
    const title = knownTitle || videoId;
    return { file: toFile(cached, title), title, videoId };
  }

  const extractedTitle = isUploadSourceId(videoId) ? undefined : await ensureYouTubeAudioExtracted(videoId, knownTitle);

  const audioResponse = await fetch(`/api/audio/${encodeURIComponent(videoId)}`);
  if (!audioResponse.ok) {
    throw new Error(`Không đọc được audio (${audioResponse.status}).`);
  }
  const blob = await audioResponse.blob();
  if (blob.size === 0) throw new Error('File audio bị rỗng.');

  const title = knownTitle || extractedTitle || videoId;
  return { file: toFile(blob, title), title, videoId };
}
