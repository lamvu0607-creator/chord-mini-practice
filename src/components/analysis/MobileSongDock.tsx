'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Slider } from '@heroui/react';
import { HiOutlineAdjustmentsHorizontal, HiOutlineChevronUp, HiOutlineXMark } from 'react-icons/hi2';
import { getAppSliderClassNames } from '@/components/ui/appSliderStyles';
import { useMediaSession } from '@/hooks/ui/useMediaSession';
import SeekStepButton from './SeekStepButton';
import { MOBILE_SONG_BAR_HEIGHT, MOBILE_VIDEO_HEIGHT_VAR } from './mobileSongLayout';

const CollapsibleVideoPlayer = dynamic(() => import('@/components/analysis/CollapsibleVideoPlayer'), { ssr: false });

const VIDEO_HEIGHT = '56.25vw';

export interface MobileSongPlayerProps {
  videoId: string;
  isPlaying: boolean;
  playbackRate: number;
  currentTime: number;
  duration: number;
  onReady: (player: unknown) => void;
  onPlay: () => void;
  onPause: () => void;
  onProgress: (state: { playedSeconds: number; played: number; loadedSeconds: number; loaded: number }) => void;
  onSeek: (time: number) => void;
  onEnded?: () => void;
  onPlaybackRateChange?: (rate: number) => void;
  youtubeMuted?: boolean;
  youtubeEmbedUrl?: string;
  videoUrl?: string;
  audioUrl?: string | null;
  videoTitle?: string;
  channelName?: string;
  thumbnailUrl?: string;
  audioOnly?: boolean;
  youtubePlayer?: unknown;
  isCountingDown?: boolean;
  countdownDisplay?: string;
}

interface MobileSongDockProps {
  player: MobileSongPlayerProps;
  /** Stays mounted while the sheet is closed, so stems and other tools keep running. */
  tools: React.ReactNode;
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
};

/**
 * Bottom of the phone song screen: player bar plus a Tools sheet.
 * The player element never moves in the tree; only its CSS changes, so opening the video does not reload it.
 */
export default function MobileSongDock({ player, tools }: MobileSongDockProps) {
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);

  const { isPlaying, currentTime, duration, onPlay, onPause, onSeek, audioOnly, youtubePlayer, isCountingDown, countdownDisplay } = player;
  const isReady = Boolean(youtubePlayer);
  const hasPlayableSource = Boolean(player.youtubeEmbedUrl || player.videoUrl || (audioOnly && player.audioUrl));

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(MOBILE_VIDEO_HEIGHT_VAR, isVideoOpen ? VIDEO_HEIGHT : '0px');
    return () => {
      root.style.removeProperty(MOBILE_VIDEO_HEIGHT_VAR);
    };
  }, [isVideoOpen]);

  useMediaSession({
    enabled: hasPlayableSource && isReady,
    title: player.videoTitle,
    artist: player.channelName,
    artworkUrl: player.thumbnailUrl || (audioOnly ? undefined : `https://i.ytimg.com/vi/${player.videoId}/hqdefault.jpg`),
    isPlaying,
    currentTime,
    duration,
    onPlay,
    onPause,
    onSeek,
  });

  if (!hasPlayableSource) return null;

  const readPlayerTime = () => (youtubePlayer as { getCurrentTime?: () => number } | undefined)?.getCurrentTime?.();
  const shownTime = dragTime ?? currentTime;

  return (
    <>
      <div
        data-testid="mobile-song-video"
        className={`fixed overflow-hidden bg-slate-900 ${
          isVideoOpen ? 'inset-x-0 top-0 z-[82]' : 'left-2 z-[85] h-11 w-16 rounded-md'
        }`}
        style={isVideoOpen
          ? { height: VIDEO_HEIGHT }
          : { bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <CollapsibleVideoPlayer
          bare
          videoId={player.videoId}
          audioUrl={player.audioUrl}
          videoTitle={player.videoTitle}
          channelName={player.channelName}
          thumbnailUrl={player.thumbnailUrl}
          isPlaying={isPlaying}
          playbackRate={player.playbackRate}
          currentTime={currentTime}
          duration={duration}
          onReady={player.onReady}
          onPlay={onPlay}
          onPause={onPause}
          onProgress={player.onProgress}
          onSeek={onSeek}
          onEnded={player.onEnded}
          muted={player.youtubeMuted}
          onPlaybackRateChange={player.onPlaybackRateChange}
          audioOnly={audioOnly}
        />
        {!isVideoOpen && !audioOnly && (
          <button
            type="button"
            aria-label="Show video"
            onClick={() => setIsVideoOpen(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/25 text-white"
          >
            <HiOutlineChevronUp className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      {isToolsOpen && (
        <div aria-hidden className="fixed inset-0 z-[81] bg-black/40" onClick={() => setIsToolsOpen(false)} />
      )}

      <section
        aria-label="Tools"
        hidden={!isToolsOpen}
        className="fixed inset-x-0 z-[83] max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-divider bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-slate-900"
        style={{ bottom: MOBILE_SONG_BAR_HEIGHT }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tools</h2>
          <button
            type="button"
            aria-label="Close tools"
            onClick={() => setIsToolsOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 dark:text-gray-300"
          >
            <HiOutlineXMark className="h-6 w-6" aria-hidden />
          </button>
        </div>
        {tools}
      </section>

      <div
        data-testid="mobile-song-bar"
        className="fixed inset-x-0 bottom-0 z-[84] flex items-center gap-2 border-t border-divider bg-white px-2 dark:border-white/10 dark:bg-slate-950"
        style={{ height: MOBILE_SONG_BAR_HEIGHT, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* The mini video sits over this slot while it is closed. */}
        <div className="flex h-11 w-16 flex-shrink-0 items-center justify-center">
          {isVideoOpen && (
            <button
              type="button"
              aria-label="Hide video"
              onClick={() => setIsVideoOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-gray-700 dark:text-gray-200"
            >
              <HiOutlineChevronUp className="h-6 w-6 rotate-180" aria-hidden />
            </button>
          )}
        </div>

        <SeekStepButton
          direction="back"
          currentTime={currentTime}
          getCurrentTime={readPlayerTime}
          duration={duration}
          onSeek={onSeek}
          disabled={!isReady}
          className="h-9 w-9 flex-shrink-0 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10"
        />

        <button
          type="button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={!isReady}
          onClick={isPlaying ? onPause : onPlay}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white disabled:opacity-50"
        >
          {isCountingDown ? (
            <span className="text-base font-bold">{countdownDisplay}</span>
          ) : !isReady ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : isPlaying ? (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
          ) : (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>

        <SeekStepButton
          direction="forward"
          currentTime={currentTime}
          getCurrentTime={readPlayerTime}
          duration={duration}
          onSeek={onSeek}
          disabled={!isReady}
          className="h-9 w-9 flex-shrink-0 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10"
        />

        <div className="min-w-0 flex-1">
          <Slider
            aria-label="Song position"
            size="sm"
            step={0.1}
            minValue={0}
            maxValue={duration || 100}
            value={shownTime}
            onChange={(value) => setDragTime(Array.isArray(value) ? value[0] : value)}
            onChangeEnd={(value) => {
              onSeek(Array.isArray(value) ? value[0] : value);
              setDragTime(null);
            }}
            classNames={{ base: 'max-w-none', ...getAppSliderClassNames('primary') }}
          />
          <div className="flex justify-between text-[11px] tabular-nums text-gray-600 dark:text-gray-300">
            <span>{formatTime(shownTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          aria-label="Tools"
          aria-expanded={isToolsOpen}
          onClick={() => setIsToolsOpen((open) => !open)}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${
            isToolsOpen ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
          }`}
        >
          <HiOutlineAdjustmentsHorizontal className="h-6 w-6" aria-hidden />
        </button>
      </div>
    </>
  );
}
