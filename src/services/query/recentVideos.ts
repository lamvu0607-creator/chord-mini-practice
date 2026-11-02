export interface TranscribedVideo {
  videoId: string; title?: string; channelTitle?: string; thumbnailUrl?: string; processedAt: number;
  duration?: number; beatModel?: string; chordModel?: string; bpm?: number; timeSignature?: number;
  keySignature?: string; usageCount?: number; customName?: string;
}

export interface RecentVideosPageParam { cursor: string | null }
export interface RecentVideosPage { videos: TranscribedVideo[]; nextCursor: string | null; hasMore: boolean }

export const RECENT_VIDEOS_PAGE_SIZE = 12;
export const ALL_KEYS_VALUE = 'all';
export const createInitialRecentVideosPageParam = (): RecentVideosPageParam => ({ cursor: null });

export async function fetchRecentVideosPage({ selectedKey, pageParam, pageSize = RECENT_VIDEOS_PAGE_SIZE, includeUploads, search }: {
  selectedKey: string; pageParam: RecentVideosPageParam; pageSize?: number; includeUploads?: boolean; search?: string;
}): Promise<RecentVideosPage> {
  const params = new URLSearchParams({ key: selectedKey, limit: String(pageSize) });
  if (pageParam.cursor) params.set('cursor', pageParam.cursor);
  if (includeUploads) params.set('uploads', '1');
  if (search) params.set('q', search);
  const response = await fetch(`/api/transcriptions/recent?${params}`, { cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Unable to load recent videos (${response.status})`);
  }
  return response.json() as Promise<RecentVideosPage>;
}
