import 'server-only';
import { claimAudioOwner, findAudioMetadataByVideoId } from '@/server/persistence/audioRepository';
import { findExistingLocalAudioFile } from '@/services/storage/localAudioStorageService';
import { upsertPendingStemSet } from './stemSetRepository';
import { toAudioRootRelative } from './stemStorage';

/** `upload_<hex>` and `up_<hex>` hash the same user and bytes, so a set from /api/stems/upload is reused. */
export function uploadIdToStemSourceId(videoId: string): string {
  return `up_${videoId.slice('upload_'.length)}`;
}

/**
 * Register the private stem set of an uploaded song or clip (pending until separated) and return its
 * source id plus the audio path relative to the audio root. Null when the file is gone.
 * Files uploaded before owners were recorded are assigned to the first signed-in requester.
 */
export async function resolveUploadStemSource(
  videoId: string,
  requesterUserId: string,
): Promise<{ sourceId: string; inputPath: string } | null> {
  const localAudio = await findExistingLocalAudioFile(videoId);
  const inputPath = localAudio ? await toAudioRootRelative(localAudio.filePath) : null;
  if (!localAudio || !inputPath) return null;
  claimAudioOwner(videoId, requesterUserId);
  const sourceId = uploadIdToStemSourceId(videoId);
  upsertPendingStemSet({
    sourceId,
    sourceType: 'upload',
    videoId,
    ownerUserId: findAudioMetadataByVideoId(videoId)?.ownerUserId ?? requesterUserId,
    title: localAudio.title,
    inputPath,
  });
  return { sourceId, inputPath };
}
