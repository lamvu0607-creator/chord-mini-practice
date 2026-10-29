import type { StemJob, StemSet } from '@/types/stems';

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

/** Accepts a bare id or watch / youtu.be / shorts / embed / live / music URLs. */
export function parseYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (VIDEO_ID.test(value)) return value;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    candidate = url.searchParams.get('v')
      ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1]
      ?? null;
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

export class StemsApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { error?: unknown; code?: string };
  if (!response.ok) {
    const error = payload.error;
    const message = typeof error === 'string'
      ? error
      : (error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '')
        || `Request failed (${response.status})`;
    const code = typeof payload.code === 'string'
      ? payload.code
      : (error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : undefined);
    throw new StemsApiError(message, response.status, code);
  }
  return payload;
}

export async function fetchStemSets(): Promise<{ stemSets: StemSet[]; signedIn: boolean }> {
  return readJson(await fetch('/api/stems', { cache: 'no-store' }));
}

export async function fetchStemSet(sourceId: string): Promise<{ stemSet: StemSet; activeJobId: string | null }> {
  return readJson(await fetch(`/api/stems/${encodeURIComponent(sourceId)}`, { cache: 'no-store' }));
}

export async function deleteStemSet(sourceId: string): Promise<void> {
  await readJson(await fetch(`/api/stems/${encodeURIComponent(sourceId)}`, { method: 'DELETE' }));
}

export async function createStemJob(
  body: { videoId: string; title?: string } | { sourceId: string },
): Promise<{ job?: StemJob; stemSet?: StemSet }> {
  return readJson(await fetch('/api/stems/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function fetchStemJob(jobId: string): Promise<{ job: StemJob; queuePosition: number; stemSet?: StemSet }> {
  return readJson(await fetch(`/api/stems/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' }));
}

/** Make sure the song's audio is cached on the server (reuses the analyze page's extraction). */
export async function ensureYouTubeAudio(videoId: string, title?: string): Promise<{ title?: string }> {
  const payload = await readJson<{ success?: boolean; title?: string; error?: string }>(await fetch('/api/extract-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, originalTitle: title }),
  }));
  if (payload.success === false) throw new StemsApiError(payload.error || 'Audio extraction failed', 500);
  return { title: payload.title };
}

/** Upload with progress (fetch cannot report upload progress). */
export function uploadStemSource(file: File, onProgress?: (fraction: number) => void): Promise<{ sourceId: string; stemSet: StemSet }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/stems/upload');
    request.responseType = 'json';
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(new StemsApiError('Upload failed. Check your connection.', 0));
    request.onload = () => {
      const payload = request.response ?? {};
      if (request.status >= 200 && request.status < 300) {
        resolve(payload);
        return;
      }
      const error = payload.error;
      const message = typeof error === 'string' ? error : error?.message || `Upload failed (${request.status})`;
      reject(new StemsApiError(message, request.status, typeof error === 'object' ? error?.code : payload.code));
    };
    const form = new FormData();
    form.append('file', file);
    request.send(form);
  });
}
