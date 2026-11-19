'use client';

import { useEffect, useRef, type RefObject } from 'react';

const SOFT_SYNC_DRIFT_THRESHOLD = 0.05;
const HARD_SYNC_DRIFT_THRESHOLD = 0.24;
const DRIFT_BLEND_FACTOR = 0.35;

interface SweepLineScrollOptions {
  /** Latest playback time from the store, in seconds. */
  currentTime: number;
  /** Enables the 60 fps requestAnimationFrame loop. */
  isPlaying: boolean;
  /** Fixed x position of the sweep line inside the container. */
  sweepLineX: number;
  /** Maps a playback time to the timeline's x coordinate. */
  timeToX: (time: number) => number;
}

/**
 * Scrolls a timeline under a fixed sweep line.
 *
 * While playing, a requestAnimationFrame loop interpolates time from the wall
 * clock and blends in drift corrections from the store's `currentTime`, so the
 * strip moves smoothly even though the store updates at a lower rate. While
 * paused, the strip jumps straight to `currentTime`.
 */
export function useSweepLineScroll(
  innerRef: RefObject<HTMLElement | null>,
  { currentTime, isPlaying, sweepLineX, timeToX }: SweepLineScrollOptions,
): void {
  const rafRef = useRef<number>(0);
  const isPlayingRef = useRef(isPlaying);
  const playbackBaseRef = useRef({ wallTime: 0, audioTime: currentTime });
  const sweepRef = useRef(sweepLineX);
  const timeToXRef = useRef(timeToX);
  const currentTimeRef = useRef(currentTime);

  useEffect(() => { isPlayingRef.current = isPlaying; });
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  const place = (time: number) => {
    if (innerRef.current) {
      innerRef.current.style.transform = `translateX(${-timeToXRef.current(time) + sweepRef.current}px)`;
    }
  };

  // Layout changed (new chords, capo, resize): re-place the strip when paused.
  useEffect(() => {
    sweepRef.current = sweepLineX;
    timeToXRef.current = timeToX;
    if (!isPlayingRef.current) place(currentTimeRef.current);
  }, [sweepLineX, timeToX]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-anchor the interpolation on every store time update.
  useEffect(() => {
    const now = performance.now() / 1000;
    if (isPlaying) {
      const projectedTime = playbackBaseRef.current.audioTime + (now - playbackBaseRef.current.wallTime);
      const drift = currentTime - projectedTime;
      if (Math.abs(drift) >= SOFT_SYNC_DRIFT_THRESHOLD) {
        const correctedTime = Math.abs(drift) >= HARD_SYNC_DRIFT_THRESHOLD
          ? currentTime
          : projectedTime + drift * DRIFT_BLEND_FACTOR;
        playbackBaseRef.current = { wallTime: now, audioTime: correctedTime };
      }
    } else {
      playbackBaseRef.current = { wallTime: now, audioTime: currentTime };
      place(currentTime);
    }
  }, [currentTime, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    playbackBaseRef.current = { wallTime: performance.now() / 1000, audioTime: currentTimeRef.current };

    const animate = () => {
      if (!isPlayingRef.current) return;
      const elapsed = performance.now() / 1000 - playbackBaseRef.current.wallTime;
      place(playbackBaseRef.current.audioTime + elapsed);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps
}
