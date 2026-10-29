'use client';

import { useEffect, useState } from 'react';
import { youtubeMasterClock } from '@/services/audio/youtubeMasterClock';
import type { StemMixerEngine } from '@/services/stems/stemMixerEngine';

/**
 * Same cadence and hysteresis as the pitch-shift GrainPlayer slave in usePitchShiftAudio:
 * 40 ms ticks, re-seek only when drift exceeds 0.08 s × max(rate, 1), so the stems never react
 * to jitter the master clock itself already ignores.
 */
const FOLLOW_INTERVAL_MS = 40;
const BASE_DRIFT_TOLERANCE_SEC = 0.08;

/**
 * Keeps a StemMixerEngine locked to the YouTube master clock while `enabled`.
 * The video stays in charge of play/pause/seek/rate; the stems follow it.
 * Returns the last playback error (e.g. audio blocked by the browser), if any.
 */
export function useStemFollower(engine: StemMixerEngine | null, enabled: boolean): string | null {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engine || !enabled) return undefined;
    let pending = false;

    const follow = (position: number, rate: number) => {
      pending = true;
      engine.followTo(position, rate)
        .then(() => setError(null))
        .catch((followError: unknown) => setError(followError instanceof Error ? followError.message : String(followError)))
        .finally(() => { pending = false; });
    };

    const tick = () => {
      if (pending) return;
      if (!youtubeMasterClock.isPlaying()) {
        if (engine.isPlaying) engine.pause();
        return;
      }

      const master = youtubeMasterClock.getLivePosition();
      const rate = youtubeMasterClock.getRate();
      if (!engine.isPlaying || Math.abs(engine.practiceState.rate - rate) > 0.001) {
        follow(master, rate);
        return;
      }

      // The engine clock is where samples are scheduled; the listener hears them later.
      const audible = engine.getCurrentTime() - engine.outputLatencySeconds * rate;
      if (Math.abs(audible - master) > BASE_DRIFT_TOLERANCE_SEC * Math.max(rate, 1)) {
        follow(master, rate);
      }
    };

    tick();
    const interval = window.setInterval(tick, FOLLOW_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      engine.pause();
    };
  }, [engine, enabled]);

  return enabled ? error : null;
}
