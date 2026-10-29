'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Popover, PopoverContent, PopoverTrigger, Progress, Slider, Spinner, Switch, Tooltip } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HiOutlineAdjustmentsVertical } from 'react-icons/hi2';
import UtilityPopoverPanel from '@/components/analysis/UtilityPopoverPanel';
import { useStemFollower } from '@/hooks/stems/useStemFollower';
import { useStemMixer } from '@/hooks/stems/useStemMixer';
import { useStemSeparation } from '@/hooks/stems/useStemSeparation';
import { createStemAudioContext } from '@/services/stems/stemMixerEngine';
import { fetchStemSet, StemsApiError } from '@/services/stems/stemsApi';
import { useAuthStore } from '@/stores/authStore';
import { useIsStemModeEnabled, useUIStore } from '@/stores/uiStore';
import type { StemSet } from '@/types/stems';
import StemSeparationStatus from './StemSeparationStatus';
import { getStemColor } from './stemColors';

interface AnalyzeStemControlProps {
  videoId: string;
  title?: string;
}

const tooltipClassNames = {
  content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg',
};

/**
 * Utility-bar control for the analyze page: split the song into stems and play them in place of
 * the YouTube audio while the video (and the chord grid) stays the master clock.
 * All state lives here, so closing the popover keeps the stems playing.
 */
export default function AnalyzeStemControl({ videoId, title }: AnalyzeStemControlProps) {
  const sourceId = `yt_${videoId}`;
  const queryClient = useQueryClient();
  const queryKey = ['stems', 'set', sourceId] as const;
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const openLoginModal = useAuthStore((state) => state.openLoginModal);
  const isStemModeEnabled = useIsStemModeEnabled();
  const setIsStemModeEnabled = useUIStore((state) => state.setIsStemModeEnabled);
  const [isOpen, setIsOpen] = useState(false);
  // Created inside the enabling click so playback can later start without a user gesture.
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  const stemQuery = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await fetchStemSet(sourceId);
      } catch (error) {
        if (error instanceof StemsApiError && error.status === 404) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
  const stemSet: StemSet | null = stemQuery.data?.stemSet.status === 'ready' ? stemQuery.data.stemSet : null;

  const separation = useStemSeparation((ready) => {
    queryClient.setQueryData(queryKey, { stemSet: ready, activeJobId: null });
    void queryClient.invalidateQueries({ queryKey: ['stems', 'library'] });
  });
  const { resume } = separation;
  const activeJobId = stemQuery.data?.activeJobId ?? null;
  const busy = ['preparing', 'uploading', 'queued', 'processing'].includes(separation.state.phase);

  // Someone (maybe another tab) is already separating this song: follow that job.
  useEffect(() => {
    if (activeJobId && separation.state.phase === 'idle') resume(activeJobId, title);
  }, [activeJobId, resume, separation.state.phase, title]);

  const mixer = useStemMixer(isStemModeEnabled && stemSet ? stemSet : null, isStemModeEnabled ? audioContext : null);
  const followError = useStemFollower(mixer.engine, isStemModeEnabled);
  const { engine, tracks, practice } = mixer;
  const anySolo = tracks.some((track) => track.soloed);

  const toggleStemMode = useCallback((enabled: boolean) => {
    if (enabled) {
      const context = createStemAudioContext('interactive');
      void context.resume().catch(() => undefined);
      setAudioContext(context);
    } else {
      setAudioContext(null);
    }
    setIsStemModeEnabled(enabled);
  }, [setIsStemModeEnabled]);

  const startSeparation = () => {
    if (!isAuthenticated) {
      openLoginModal(false);
      return;
    }
    void separation.start({ kind: 'youtube', videoId, title });
  };

  const buttonClassName = `h-9 w-9 min-w-9 rounded-full shadow-md transition-colors duration-200 inline-flex items-center justify-center p-0 ${
    isStemModeEnabled
      ? 'bg-pink-600 text-white hover:bg-pink-700'
      : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
  }`;

  return (
    <Popover
      placement="top"
      offset={10}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      // Follow mode auto-scrolls the chord grid while playing; the panel must survive that.
      shouldCloseOnScroll={false}
      classNames={{ content: 'p-0 border-none bg-transparent shadow-none' }}
    >
      <PopoverTrigger>
        <div className="relative inline-block">
          <Tooltip content={isStemModeEnabled ? 'Stems are playing' : 'Stems: mute vocals, drums, bass…'} placement="top" classNames={tooltipClassNames}>
            <button type="button" className={buttonClassName} aria-label="Stems" aria-pressed={isStemModeEnabled}>
              <HiOutlineAdjustmentsVertical className="h-4 w-4" />
            </button>
          </Tooltip>
          {busy && (
            <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent>
        <UtilityPopoverPanel title="Stems" bodyClassName="flex w-[320px] flex-col gap-3 p-4">
          {stemQuery.isLoading ? (
            <div className="flex justify-center py-3"><Spinner size="sm" /></div>
          ) : !stemSet ? (
            <>
              {separation.state.phase === 'idle' || separation.state.phase === 'error' ? (
                <>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Split this song into vocals, drums, bass and other, then mute or solo parts while you follow the chords.
                  </p>
                  <Button size="sm" color="primary" onPress={startSeparation}>
                    {isAuthenticated ? 'Split stems (about a minute)' : 'Sign in to split stems'}
                  </Button>
                </>
              ) : null}
              <StemSeparationStatus state={separation.state} onDismiss={separation.reset} />
            </>
          ) : (
            <>
              <Switch size="sm" isSelected={isStemModeEnabled} onValueChange={toggleStemMode}>
                <span className="text-sm">Play stems instead of the original audio</span>
              </Switch>

              {isStemModeEnabled && !engine && !mixer.error && (
                <div>
                  <p className="mb-1 text-xs text-gray-600 dark:text-gray-300">Loading stems…</p>
                  <Progress aria-label="Loading stems" size="sm" value={mixer.loadProgress * 100} />
                </div>
              )}
              {mixer.error && <p className="text-xs text-red-600 dark:text-red-400">Could not load stems: {mixer.error}</p>}
              {followError && <p className="text-xs text-amber-600 dark:text-amber-400">{followError}</p>}

              {engine && (
                <div className="flex flex-col gap-2">
                  {tracks.map((track) => {
                    const color = getStemColor(track.name);
                    const audible = !track.muted && (!anySolo || track.soloed);
                    return (
                      <div key={track.name} className={`flex items-center gap-2 ${audible ? '' : 'opacity-60'}`}>
                        <span className={`inline-flex w-16 justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${color.chip}`}>
                          {color.label}
                        </span>
                        <button
                          type="button"
                          aria-pressed={track.muted}
                          aria-label={`Mute ${color.label}`}
                          onClick={() => engine.setMuted(track.name, !track.muted)}
                          className={`h-7 w-7 rounded-md border text-xs font-bold ${track.muted ? 'border-red-400 bg-red-500 text-white' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}
                        >M</button>
                        <button
                          type="button"
                          aria-pressed={track.soloed}
                          aria-label={`Solo ${color.label}`}
                          onClick={() => engine.setSoloed(track.name, !track.soloed)}
                          className={`h-7 w-7 rounded-md border text-xs font-bold ${track.soloed ? 'border-yellow-400 bg-yellow-400 text-gray-900' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}
                        >S</button>
                        <Slider
                          aria-label={`${color.label} volume`}
                          size="sm"
                          minValue={0}
                          maxValue={1.5}
                          step={0.01}
                          value={track.volume}
                          onChange={(value) => engine.setVolume(track.name, Array.isArray(value) ? value[0] : value)}
                          className="flex-1"
                        />
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between border-t border-white/20 pt-2 text-xs dark:border-white/10">
                    <span className="font-semibold text-gray-600 dark:text-gray-300">Pitch</span>
                    <span className="flex items-center gap-1">
                      <Button size="sm" variant="flat" className="h-7 min-w-0 px-2" aria-label="Pitch down" onPress={() => engine.setSemitones(practice.semitones - 1)}>−</Button>
                      <span className="w-8 text-center font-mono tabular-nums">
                        {practice.semitones > 0 ? `+${practice.semitones}` : practice.semitones}
                      </span>
                      <Button size="sm" variant="flat" className="h-7 min-w-0 px-2" aria-label="Pitch up" onPress={() => engine.setSemitones(practice.semitones + 1)}>+</Button>
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    The video controls play, pause, seek and speed; the stems follow it.
                  </p>
                </div>
              )}

              <Link href={`/stems?id=${encodeURIComponent(sourceId)}`} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                Open the full stem player (waveforms, loop, downloads) →
              </Link>
            </>
          )}
        </UtilityPopoverPanel>
      </PopoverContent>
    </Popover>
  );
}
