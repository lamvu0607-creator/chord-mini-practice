import type {
  MelodyTranscriptionData,
  TranscriptionData,
  TranscriptionEnrichmentUpdate,
} from '@/types/transcription';

export type { MelodyTranscriptionData, RomanNumeralData, SequenceCorrectionsData, TranscriptionData, TranscriptionEnrichmentUpdate } from '@/types/transcription';
export { buildTranscriptionId as buildTranscriptionDocId } from '@/types/transcription';

export function normalizeTranscriptionData(
  data: TranscriptionData,
): Omit<TranscriptionData, 'createdAt'> {
  const { createdAt: _createdAt, ...normalized } = data;
  return normalized;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Persistence request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function getTranscription(videoId: string, beatModel: string, chordModel: string): Promise<TranscriptionData | null> {
  try {
    const params = new URLSearchParams({ beatModel, chordModel });
    const response = await fetch(`/api/transcriptions/${encodeURIComponent(videoId)}?${params}`, { cache: 'no-store' });
    if (response.status === 404) return null;
    const result = await readJson<{ data: TranscriptionData | null }>(response);
    return result.data;
  } catch (error) {
    console.warn('Unable to read the local transcription cache:', error);
    return null;
  }
}

export async function saveTranscription(data: Omit<TranscriptionData, 'createdAt'>): Promise<boolean> {
  try {
    await readJson(await fetch('/api/transcriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }));
    return true;
  } catch (error) {
    console.error('Unable to save transcription:', error);
    return false;
  }
}

export async function updateTranscriptionEnrichment(
  videoId: string,
  beatModel: string,
  chordModel: string,
  enrichment: TranscriptionEnrichmentUpdate,
): Promise<boolean> {
  try {
    await readJson(await fetch('/api/transcriptions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, beatModel, chordModel, enrichment }),
    }));
    return true;
  } catch (error) {
    console.error('Unable to update transcription enrichment:', error);
    return false;
  }
}

export async function incrementTranscriptionUsage(videoId: string, beatModel: string, chordModel: string): Promise<boolean> {
  try {
    await readJson(await fetch(`/api/transcriptions/${encodeURIComponent(videoId)}/usage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beatModel, chordModel }),
    }));
    return true;
  } catch (error) {
    console.warn('Unable to update local usage count:', error);
    return false;
  }
}

export async function getVideoTranscriptions(videoId: string): Promise<TranscriptionData[]> {
  try {
    const response = await fetch(`/api/transcriptions/${encodeURIComponent(videoId)}`, { cache: 'no-store' });
    if (response.status === 404) return [];
    const result = await readJson<{ data?: TranscriptionData; variants?: TranscriptionData[] }>(response);
    return result.variants || (result.data ? [result.data] : []);
  } catch {
    return [];
  }
}

export async function getMelodyTranscription(videoId: string): Promise<MelodyTranscriptionData | null> {
  try {
    const result = await readJson<{ data: MelodyTranscriptionData | null }>(await fetch(`/api/melody-cache?videoId=${encodeURIComponent(videoId)}`, { cache: 'no-store' }));
    return result.data;
  } catch {
    return null;
  }
}

export async function saveMelodyTranscription(): Promise<boolean> {
  // Melody writes are performed by the server-side SheetSage route.
  return false;
}
