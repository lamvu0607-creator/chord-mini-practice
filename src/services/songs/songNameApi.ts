import type { SongName } from '@/types/songName';

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { error?: unknown };
  if (!response.ok) {
    const error = payload.error;
    const message = typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
    throw new Error(message || `Request failed (${response.status})`);
  }
  return payload;
}

const nameUrl = (videoId: string) => `/api/songs/${encodeURIComponent(videoId)}/name`;

export async function fetchSongName(videoId: string): Promise<SongName | null> {
  return (await readJson<{ songName: SongName | null }>(await fetch(nameUrl(videoId), { cache: 'no-store' }))).songName;
}

export async function saveSongName(videoId: string, name: string): Promise<SongName> {
  const response = await fetch(nameUrl(videoId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await readJson<{ songName: SongName }>(response)).songName;
}

export async function clearSongName(videoId: string): Promise<void> {
  await readJson(await fetch(nameUrl(videoId), { method: 'DELETE' }));
}
