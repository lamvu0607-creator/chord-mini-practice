'use client';

import { useState } from 'react';
import {
  CHORDMINI_FALLBACK_THUMBNAIL,
  CHORDMINI_FALLBACK_THUMBNAIL_DARK,
  isRealThumbnailUrl,
} from '@/utils/youtubeMetadata';

interface RecentVideoThumbnailProps {
  thumbnailUrl?: string | null;
  alt: string;
}

/**
 * Thumbnail for a recent song. Uploads and trimmed clips have no image, so
 * they (and any image that fails to load) show the ChordMini logo instead.
 */
export default function RecentVideoThumbnail({ thumbnailUrl, alt }: RecentVideoThumbnailProps) {
  const [failed, setFailed] = useState(false);

  if (isRealThumbnailUrl(thumbnailUrl) && !failed) {
    return (
      // Intentionally use direct YouTube thumbnails to avoid Vercel image-optimization quota usage.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbnailUrl}
        alt={alt}
        width={80}
        height={48}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-blue-50 dark:bg-slate-800" data-testid="recent-thumbnail-fallback">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CHORDMINI_FALLBACK_THUMBNAIL}
        alt={alt}
        width={40}
        height={40}
        className="block h-10 w-10 rounded-md object-contain dark:hidden"
        loading="lazy"
        decoding="async"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CHORDMINI_FALLBACK_THUMBNAIL_DARK}
        alt=""
        aria-hidden
        width={40}
        height={40}
        className="hidden h-10 w-10 rounded-md object-contain opacity-80 dark:block"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
