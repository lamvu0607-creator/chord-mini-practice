export type YouTubeThumbnailQuality =
  | 'default'
  | 'mqdefault'
  | 'hqdefault'
  | 'sddefault'
  | 'maxresdefault';

/** ChordMini logo, used wherever a song has no real thumbnail (uploads, trimmed clips). */
export const CHORDMINI_FALLBACK_THUMBNAIL = '/chordMiniLogo.webp';
export const CHORDMINI_FALLBACK_THUMBNAIL_DARK = '/chordMiniLogo-dark.webp';

// Older rows may still store this path, but the file was never shipped.
const LEGACY_PLACEHOLDER_THUMBNAIL = '/hero-image-placeholder.svg';

/** True when `url` is a usable image, not empty and not one of our placeholders. */
export function isRealThumbnailUrl(url: string | null | undefined): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return (
    trimmed.length > 0 &&
    trimmed !== LEGACY_PLACEHOLDER_THUMBNAIL &&
    trimmed !== CHORDMINI_FALLBACK_THUMBNAIL &&
    trimmed !== CHORDMINI_FALLBACK_THUMBNAIL_DARK
  );
}

function isValidVideoId(videoId: string | null | undefined): videoId is string {
  return typeof videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildYouTubeThumbnailUrl(
  videoId: string | null | undefined,
  quality: YouTubeThumbnailQuality = 'mqdefault'
): string {
  if (!isValidVideoId(videoId)) {
    return CHORDMINI_FALLBACK_THUMBNAIL;
  }

  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

export function normalizeThumbnailUrl(
  videoId: string | null | undefined,
  thumbnail: string | null | undefined,
  quality: YouTubeThumbnailQuality = 'mqdefault'
): string {
  if (isNonEmptyString(thumbnail)) {
    return thumbnail.trim();
  }

  return buildYouTubeThumbnailUrl(videoId, quality);
}

export function pickPreferredChannelTitle(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (!isNonEmptyString(candidate)) {
      continue;
    }

    const normalized = candidate.trim();
    if (normalized === 'Unknown' || normalized === 'Unknown Channel') {
      continue;
    }

    return normalized;
  }

  return null;
}
