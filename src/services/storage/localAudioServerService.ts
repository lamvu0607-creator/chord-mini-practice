import 'server-only';

import {
  deleteLocalAudioFile,
  enforceLocalAudioQuota,
  findExistingLocalAudioFile,
  findLocalAudioFileByFilename,
  saveLocalAudioFile,
  saveLocalAudioMetadata,
} from './localAudioStorageService';
import type { AudioFileData, StoredAudioResult, UploadableFile } from './localAudioService';

export async function findExistingAudioFile(videoId: string): Promise<StoredAudioResult | null> {
  const file = await findExistingLocalAudioFile(videoId);
  return file
    ? { audioUrl: file.audioUrl, storagePath: `audio/${file.filename}`, fileSize: file.fileSize }
    : null;
}

export async function findExistingAudioFiles(videoIds: string[]): Promise<Map<string, StoredAudioResult>> {
  const pairs = await Promise.all(videoIds.map(async (id) => [id, await findExistingAudioFile(id)] as const));
  return new Map(pairs.filter((pair): pair is readonly [string, StoredAudioResult] => pair[1] !== null));
}

export async function uploadAudioFile(
  videoId: string,
  audioFile: UploadableFile,
  _videoFile?: UploadableFile,
): Promise<StoredAudioResult | null> {
  try {
    const bytes = audioFile instanceof ArrayBuffer
      ? new Uint8Array(audioFile)
      : new Uint8Array(await audioFile.arrayBuffer());
    const saved = await saveLocalAudioFile(videoId, bytes, {
      filename: audioFile instanceof File ? audioFile.name : `${videoId}.mp3`,
      contentType: audioFile instanceof Blob ? audioFile.type : 'audio/mpeg',
    });
    void enforceLocalAudioQuota();
    return { audioUrl: saved.audioUrl, storagePath: `audio/${saved.filename}`, fileSize: saved.fileSize };
  } catch (error) {
    console.error('Local audio upload failed:', error);
    return null;
  }
}

export async function saveAudioFileMetadata(data: Omit<AudioFileData, 'createdAt'>): Promise<boolean> {
  const filename = data.storagePath.replace(/^audio[\\/]/, '');
  const file = await findLocalAudioFileByFilename(filename);
  if (!file) return false;
  await saveLocalAudioMetadata({
    videoId: data.videoId,
    filename,
    fileSize: data.fileSize || file.fileSize,
    title: data.title,
    duration: data.duration,
  });
  return true;
}

export async function deleteAudioFile(storagePath: string): Promise<boolean> {
  return deleteLocalAudioFile(storagePath.replace(/^audio[\\/]/, ''));
}
