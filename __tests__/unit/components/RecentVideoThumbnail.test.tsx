import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import RecentVideoThumbnail from '@/components/homepage/RecentVideoThumbnail';
import { buildYouTubeThumbnailUrl, isRealThumbnailUrl } from '@/utils/youtubeMetadata';

describe('RecentVideoThumbnail', () => {
  it('keeps the YouTube thumbnail for YouTube songs', () => {
    render(<RecentVideoThumbnail thumbnailUrl="https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" alt="Song" />);

    expect(screen.getByAltText('Song')).toHaveAttribute('src', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
    expect(screen.queryByTestId('recent-thumbnail-fallback')).not.toBeInTheDocument();
  });

  it.each([
    ['no thumbnail (upload / trimmed clip)', undefined],
    ['the legacy missing placeholder', '/hero-image-placeholder.svg'],
    ['the stored fallback for an upload id', buildYouTubeThumbnailUrl('upload_0123456789abcdef01234567')],
  ])('shows the ChordMini logo for %s', (_label, thumbnailUrl) => {
    render(<RecentVideoThumbnail thumbnailUrl={thumbnailUrl} alt="My upload" />);

    expect(screen.getByTestId('recent-thumbnail-fallback')).toBeInTheDocument();
    expect(screen.getByAltText('My upload')).toHaveAttribute('src', '/chordMiniLogo.webp');
  });

  it('falls back to the logo when the image fails to load', () => {
    render(<RecentVideoThumbnail thumbnailUrl="https://i.ytimg.com/vi/broken/mqdefault.jpg" alt="Song" />);

    fireEvent.error(screen.getByAltText('Song'));

    expect(screen.getByTestId('recent-thumbnail-fallback')).toBeInTheDocument();
  });
});

describe('isRealThumbnailUrl', () => {
  it('rejects empty values and placeholders', () => {
    expect(isRealThumbnailUrl(undefined)).toBe(false);
    expect(isRealThumbnailUrl('  ')).toBe(false);
    expect(isRealThumbnailUrl('/hero-image-placeholder.svg')).toBe(false);
    expect(isRealThumbnailUrl('/chordMiniLogo.webp')).toBe(false);
    expect(isRealThumbnailUrl('https://i.ytimg.com/vi/x/mqdefault.jpg')).toBe(true);
  });
});
