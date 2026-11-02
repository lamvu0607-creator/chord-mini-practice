import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query/queryKeys';
import { clearSongName, fetchSongName, saveSongName } from '@/services/songs/songNameApi';
import { useAuthStore } from '@/stores/authStore';
import type { SongName } from '@/types/songName';

const songNameKey = (videoId: string) => ['song-name', videoId] as const;

/** The custom name of a song, for signed-in users. Changes also refresh the recent songs list. */
export function useSongName(videoId: string) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((store) => store.isAuthenticated);

  const query = useQuery({
    queryKey: songNameKey(videoId),
    queryFn: () => fetchSongName(videoId),
    enabled: isAuthenticated && Boolean(videoId),
    staleTime: 30_000,
  });

  const update = useCallback((songName: SongName | null) => {
    queryClient.setQueryData(songNameKey(videoId), songName);
    void queryClient.invalidateQueries({ queryKey: queryKeys.recentVideos.all });
  }, [queryClient, videoId]);

  const save = useCallback(async (name: string) => {
    update(await saveSongName(videoId, name));
  }, [update, videoId]);

  const clear = useCallback(async () => {
    await clearSongName(videoId);
    update(null);
  }, [update, videoId]);

  return { songName: isAuthenticated ? query.data ?? null : null, isAuthenticated, save, clear };
}
