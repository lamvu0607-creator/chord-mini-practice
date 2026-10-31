import 'server-only';
import { findVideoTranscriptions } from '@/server/persistence/transcriptionRepository';
import { findExistingLocalAudioFile } from '@/services/storage/localAudioStorageService';
import { upsertPendingStemSet } from './stemSetRepository';
import { toAudioRootRelative, youtubeSourceId } from './stemStorage';

/**
 * Register the stem set of a cached YouTube song (pending until separated) and return its source id
 * plus the cached mix path relative to the audio root. Null when the audio is not cached yet.
 */
export async function resolveYouTubeStemSource(
  videoId: string,
  title?: string,
): Promise<{ sourceId: string; inputPath: string } | null> {
  const localAudio = await findExistingLocalAudioFile(videoId);
  const inputPath = localAudio ? await toAudioRootRelative(localAudio.filePath) : null;
  if (!localAudio || !inputPath) return null;
  const sourceId = youtubeSourceId(videoId);
  const knownTitle = title
    ?? findVideoTranscriptions(videoId).find((entry) => entry.title)?.title
    ?? (localAudio.title && localAudio.title !== 'YouTube Video' ? localAudio.title : undefined);
  upsertPendingStemSet({ sourceId, sourceType: 'youtube', videoId, title: knownTitle, inputPath });
  return { sourceId, inputPath };
}
