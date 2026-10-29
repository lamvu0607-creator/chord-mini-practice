/**
 * Uploaded audio gets an id shaped like `upload_<24 hex>` so it can use the same
 * /analyze/<id> page, caches and storage as YouTube videos (11-char ids).
 * The hex part is derived from the uploader and the file content (see /api/audio/upload),
 * so ids are unguessable and the same user re-uploading the same file gets the same id.
 */

export const UPLOAD_SOURCE_ID_PREFIX = 'upload_';

const UPLOAD_SOURCE_ID_PATTERN = /^upload_[a-f0-9]{24}$/;

export function isUploadSourceId(id: string | null | undefined): boolean {
  return typeof id === 'string' && UPLOAD_SOURCE_ID_PATTERN.test(id);
}

/** Builds the id from a hex digest of `${userId}:${contentHash}`. */
export function toUploadSourceId(hexDigest: string): string {
  return `${UPLOAD_SOURCE_ID_PREFIX}${hexDigest.slice(0, 24).toLowerCase()}`;
}
