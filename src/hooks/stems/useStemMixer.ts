'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { StemMixerEngine, type PracticeState, type StemTrackState } from '@/services/stems/stemMixerEngine';
import { STEM_DISPLAY_ORDER, type StemSet } from '@/types/stems';

export interface StemMixerHandle {
  engine: StemMixerEngine | null;
  loading: boolean;
  loadProgress: number;
  error: string | null;
  isPlaying: boolean;
  duration: number;
  tracks: StemTrackState[];
  practice: PracticeState;
}

const EMPTY_TRACKS: StemTrackState[] = [];
const DEFAULT_PRACTICE: PracticeState = { rate: 1, semitones: 0, loop: null, loopEnabled: false };

function orderStems(stemSet: StemSet) {
  return [...stemSet.stems].sort((a, b) => {
    const left = STEM_DISPLAY_ORDER.indexOf(a.name);
    const right = STEM_DISPLAY_ORDER.indexOf(b.name);
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
  });
}

/** Owns one StemMixerEngine per opened stem set and exposes its state to React. */
export function useStemMixer(stemSet: StemSet | null, context?: AudioContext | null): StemMixerHandle {
  const [engine, setEngine] = useState<StemMixerEngine | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sourceId = stemSet?.sourceId;
  const stemsKey = stemSet?.stems.map((stem) => stem.url).join('|');

  useEffect(() => {
    if (!stemSet || stemSet.stems.length === 0 || context === null) return undefined;
    const next = new StemMixerEngine(context);
    const controller = new AbortController();
    setLoading(true);
    setLoadProgress(0);
    setError(null);
    setEngine(null);

    next.load(orderStems(stemSet).map(({ name, url }) => ({ name, url })), setLoadProgress, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        setEngine(next);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load stems');
        setLoading(false);
      });

    return () => {
      controller.abort();
      next.dispose();
      setEngine(null);
    };
    // Re-create only when a different set (or different stem files) is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, stemsKey, context]);

  const subscribe = useCallback((listener: () => void) => engine?.subscribe(listener) ?? (() => {}), [engine]);
  const isPlaying = useSyncExternalStore(subscribe, () => engine?.isPlaying ?? false, () => false);
  const tracksSnapshot = useSyncExternalStore(subscribe, () => engine ? trackSnapshot(engine) : EMPTY_TRACKS, () => EMPTY_TRACKS);
  const practice = useSyncExternalStore(subscribe, () => engine ? practiceSnapshot(engine) : DEFAULT_PRACTICE, () => DEFAULT_PRACTICE);

  return {
    engine,
    loading,
    loadProgress,
    error,
    isPlaying,
    duration: engine?.duration ?? 0,
    tracks: tracksSnapshot,
    practice,
  };
}

// useSyncExternalStore needs a stable snapshot between changes; cache per engine + content.
const snapshotCache = new WeakMap<StemMixerEngine, { key: string; value: StemTrackState[] }>();
function trackSnapshot(engine: StemMixerEngine): StemTrackState[] {
  const value = engine.trackStates;
  const key = JSON.stringify(value);
  const cached = snapshotCache.get(engine);
  if (cached && cached.key === key) return cached.value;
  snapshotCache.set(engine, { key, value });
  return value;
}

const practiceCache = new WeakMap<StemMixerEngine, { key: string; value: PracticeState }>();
function practiceSnapshot(engine: StemMixerEngine): PracticeState {
  const value = engine.practiceState;
  const key = JSON.stringify(value);
  const cached = practiceCache.get(engine);
  if (cached && cached.key === key) return cached.value;
  practiceCache.set(engine, { key, value });
  return value;
}

/** Current playback time, refreshed every animation frame while playing. */
export function usePlaybackClock(engine: StemMixerEngine | null, isPlaying: boolean): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!engine) return undefined;
    let frame = 0;
    const update = () => setTime(engine.getCurrentTime());
    update();
    const unsubscribe = engine.subscribe(update);
    if (isPlaying) {
      const loop = () => {
        update();
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [engine, isPlaying]);
  return time;
}
