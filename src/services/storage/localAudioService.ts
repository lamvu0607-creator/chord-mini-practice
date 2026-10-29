export interface AudioFileData {
  videoId: string;
  audioUrl: string;
  videoUrl?: string | null;
  title: string;
  storagePath: string;
  videoStoragePath?: string | null;
  fileSize: number;
  videoFileSize?: number;
  duration?: number;
  createdAt: number;
  isStreamUrl?: boolean;
  streamExpiresAt?: number;
  channelTitle?: string;
  thumbnail?: string;
  extractionService?: string;
  extractionTimestamp?: number;
  videoDescription?: string;
  videoDuration?: string;
  videoPublishedAt?: string;
  videoViewCount?: number;
}

export type UploadableFile = File | Blob | ArrayBuffer;

export interface StoredAudioResult {
  audioUrl: string;
  videoUrl?: string;
  storagePath: string;
  videoStoragePath?: string;
  fileSize?: number;
}

async function responsePayload(response: Response): Promise<StoredAudioResult> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Local audio request failed (${response.status})`);
  }
  return response.json() as Promise<StoredAudioResult>;
}

export async function findExistingAudioFile(videoId: string): Promise<StoredAudioResult | null> {
  try {
    const response = await fetch(`/api/serve-local-audio?videoId=${encodeURIComponent(videoId)}`, { cache: 'no-store' });
    return response.status === 404 ? null : responsePayload(response);
  } catch (error) {
    console.warn('Local audio lookup failed:', error);
    return null;
  }
}

export async function findExistingAudioFiles(videoIds: string[]): Promise<Map<string, StoredAudioResult>> {
  const pairs = await Promise.all(videoIds.map(async (id) => [id, await findExistingAudioFile(id)] as const));
  return new Map(pairs.filter((pair): pair is readonly [string, StoredAudioResult] => pair[1] !== null));
}

export async function uploadAudioFile(videoId: string, audioFile: UploadableFile, videoFile?: UploadableFile): Promise<StoredAudioResult | null> {
  void videoFile;
  try {
    const blob = audioFile instanceof ArrayBuffer ? new Blob([audioFile], { type: 'audio/mpeg' }) : audioFile;
    const formData = new FormData();
    formData.append('videoId', videoId);
    formData.append('audio', blob, audioFile instanceof File ? audioFile.name : `${videoId}.mp3`);
    return responsePayload(await fetch('/api/serve-local-audio', { method: 'POST', body: formData }));
  } catch (error) {
    console.error('Local audio upload failed:', error);
    return null;
  }
}

export async function saveAudioFileMetadata(data: Omit<AudioFileData, 'createdAt'>): Promise<boolean> {
  try {
    return (await fetch('/api/serve-local-audio', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: data.videoId, storagePath: data.storagePath, title: data.title, duration: data.duration, fileSize: data.fileSize }),
    })).ok;
  } catch { return false; }
}

export async function getAudioFileMetadata(videoId: string): Promise<AudioFileData | null> {
  const file = await findExistingAudioFile(videoId);
  return file ? {
    videoId, audioUrl: file.audioUrl, title: `YouTube Video ${videoId}`, storagePath: file.storagePath,
    fileSize: file.fileSize ?? 0, createdAt: Date.now(), isStreamUrl: false,
  } : null;
}

export const getCachedAudioFile = getAudioFileMetadata;

export async function saveStreamUrlMetadata(): Promise<boolean> {
  return true;
}

export async function deleteAudioFile(storagePath: string): Promise<boolean> {
  const filename = storagePath.replace(/^audio[\\/]/, '');
  return (await fetch(`/api/serve-local-audio?filename=${encodeURIComponent(filename)}`, { method: 'DELETE' })).ok;
}
