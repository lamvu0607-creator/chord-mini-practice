'use client';

import { useEffect, useRef } from 'react';

interface MediaSessionOptions {
  /** Off while nothing playable is loaded. */
  enabled: boolean;
  title?: string;
  artist?: string;
  artworkUrl?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
}

const SKIP_SECONDS = 10;
const DEFAULT_ARTWORK = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
];

/**
 * Lock screen and notification controls. Browsers show them for audio played by a media element;
 * an embedded YouTube player or Web Audio playback may not get them.
 */
export function useMediaSession({
  enabled, title, artist, artworkUrl, isPlaying, currentTime, duration, onPlay, onPause, onSeek,
}: MediaSessionOptions): void {
  // Handlers change every render; the session keeps calling the latest ones.
  const handlers = useRef({ onPlay, onPause, onSeek, currentTime, duration });
  handlers.current = { onPlay, onPause, onSeek, currentTime, duration };

  const supported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

  useEffect(() => {
    if (!supported || !enabled) return undefined;
    const session = navigator.mediaSession;
    const seekBy = (delta: number) => {
      const { currentTime: now, duration: total } = handlers.current;
      handlers.current.onSeek(Math.max(0, Math.min(total || Infinity, now + delta)));
    };
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => handlers.current.onPlay()],
      ['pause', () => handlers.current.onPause()],
      ['seekbackward', (details) => seekBy(-(details.seekOffset ?? SKIP_SECONDS))],
      ['seekforward', (details) => seekBy(details.seekOffset ?? SKIP_SECONDS)],
      ['seekto', (details) => { if (details.seekTime !== undefined) handlers.current.onSeek(details.seekTime); }],
    ];
    for (const [action, handler] of actions) {
      try { session.setActionHandler(action, handler); } catch { /* action not supported here */ }
    }
    return () => {
      for (const [action] of actions) {
        try { session.setActionHandler(action, null); } catch { /* ignore */ }
      }
      session.metadata = null;
      session.playbackState = 'none';
    };
  }, [enabled, supported]);

  useEffect(() => {
    if (!supported || !enabled || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'ChordMini',
      artist: artist || 'ChordMini',
      artwork: artworkUrl ? [{ src: artworkUrl, sizes: '480x360', type: 'image/jpeg' }, ...DEFAULT_ARTWORK] : DEFAULT_ARTWORK,
    });
  }, [artist, artworkUrl, enabled, supported, title]);

  useEffect(() => {
    if (!supported || !enabled) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [enabled, isPlaying, supported]);

  // Whole seconds are enough for the lock screen progress bar.
  const wholeSecond = Math.floor(currentTime);
  useEffect(() => {
    if (!supported || !enabled || !(duration > 0)) return;
    try {
      navigator.mediaSession.setPositionState?.({ duration, position: Math.min(wholeSecond, duration), playbackRate: 1 });
    } catch { /* invalid state while loading */ }
  }, [duration, enabled, supported, wholeSecond]);
}
