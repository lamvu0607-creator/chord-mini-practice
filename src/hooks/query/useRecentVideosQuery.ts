import { InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import {
  createInitialRecentVideosPageParam,
  fetchRecentVideosPage,
  RECENT_VIDEOS_PAGE_SIZE,
  RecentVideosPage,
  RecentVideosPageParam,
} from '@/services/query/recentVideos';
import { queryKeys } from '@/services/query/queryKeys';
import { queryGcTimes, queryStaleTimes } from '@/services/query/queryOptions';

export function useRecentVideosQuery({
  selectedKey,
  enabled,
  pageSize = RECENT_VIDEOS_PAGE_SIZE,
  includeUploads,
  search,
}: {
  selectedKey: string;
  enabled: boolean;
  pageSize?: number;
  includeUploads?: boolean;
  search?: string;
}) {
  return useInfiniteQuery<RecentVideosPage, Error, InfiniteData<RecentVideosPage>, ReturnType<typeof queryKeys.recentVideos.list>, RecentVideosPageParam>({
    queryKey: queryKeys.recentVideos.list(selectedKey, pageSize, { includeUploads, search }),
    queryFn: ({ pageParam }) => fetchRecentVideosPage({
      selectedKey,
      pageParam,
      pageSize,
      includeUploads,
      search,
    }),
    initialPageParam: createInitialRecentVideosPageParam(),
    enabled,
    staleTime: queryStaleTimes.recentVideos,
    gcTime: queryGcTimes.recentVideos,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) {
        return undefined;
      }

      return { cursor: lastPage.nextCursor };
    },
  });
}
