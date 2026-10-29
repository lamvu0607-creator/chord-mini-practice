'use client';

import React, { useCallback, useState } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger, Progress, Slider, addToast } from '@heroui/react';
import { HiOutlineArrowDownTray, HiOutlineCommandLine, HiPause, HiPlay } from 'react-icons/hi2';
import { usePlaybackClock, useStemMixer } from '@/hooks/stems/useStemMixer';
import { STEM_SHORTCUTS, useStemShortcuts } from '@/hooks/stems/useStemShortcuts';
import type { StemSet } from '@/types/stems';
import StemPracticeBar from './StemPracticeBar';
import StemTrackRow from './StemTrackRow';
import { formatTime } from './stemColors';

interface StemPlayerProps {
  stemSet: StemSet;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function baseFileName(stemSet: StemSet) {
  return (stemSet.title || stemSet.videoId || 'stems').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 100) || 'stems';
}

const StemPlayer: React.FC<StemPlayerProps> = ({ stemSet }) => {
  const mixer = useStemMixer(stemSet);
  const { engine, isPlaying, duration, tracks, practice } = mixer;
  const currentTime = usePlaybackClock(engine, isPlaying);
  const [masterVolume, setMasterVolume] = useState(1);
  const [rendering, setRendering] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingLoopStart, setPendingLoopStart] = useState<number | null>(null);
  const anySolo = tracks.some((track) => track.soloed);
  const position = duration > 0 ? currentTime / duration : 0;

  const seekFraction = useCallback((fraction: number) => engine?.seek(fraction * (engine?.duration ?? 0)), [engine]);

  const selectRange = useCallback((start: number, end: number) => {
    if (!engine) return;
    setPendingLoopStart(null);
    engine.setLoop({ start: start * engine.duration, end: end * engine.duration });
  }, [engine]);

  /** "A" / "B" at the playhead: A adjusts (or starts) the loop, B closes it. */
  const setLoopPoint = useCallback((point: 'a' | 'b') => {
    if (!engine) return;
    const time = engine.getCurrentTime();
    const loop = engine.practiceState.loop;
    if (point === 'a') {
      if (loop && time < loop.end) {
        engine.setLoop({ start: time, end: loop.end });
      } else {
        if (loop) engine.setLoop(null);
        setPendingLoopStart(time);
      }
      return;
    }
    const start = loop ? loop.start : (pendingLoopStart ?? 0);
    if (time > start) {
      engine.setLoop({ start, end: time });
      setPendingLoopStart(null);
    }
  }, [engine, pendingLoopStart]);

  useStemShortcuts({ engine, tracks, selectedIndex, onSelect: setSelectedIndex, onLoopPoint: setLoopPoint });

  const loopFractions = practice.loop && duration > 0
    ? { start: practice.loop.start / duration, end: practice.loop.end / duration, enabled: practice.loopEnabled }
    : null;

  const renderAndDownload = useCallback(async (kind: 'karaoke' | 'mix') => {
    if (!engine) return;
    setRendering(kind);
    try {
      const gains = kind === 'karaoke'
        ? Object.fromEntries(tracks.map((track) => [track.name, track.name === 'vocals' ? 0 : 1]))
        : undefined;
      const blob = await engine.renderMix(gains);
      triggerDownload(blob, `${baseFileName(stemSet)} - ${kind === 'karaoke' ? 'karaoke' : 'custom mix'}.wav`);
    } catch (error) {
      addToast({ title: 'Export failed', description: error instanceof Error ? error.message : String(error), color: 'danger' });
    } finally {
      setRendering(null);
    }
  }, [engine, stemSet, tracks]);

  if (mixer.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        Could not load stems: {mixer.error}
      </div>
    );
  }

  if (!engine) {
    return (
      <div className="rounded-xl border border-divider bg-content1/90 p-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06]">
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">Loading stems into the player…</p>
        <Progress aria-label="Loading stems" size="sm" value={mixer.loadProgress * 100} color="primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-divider bg-content1/90 p-3 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06]">
        <Button
          isIconOnly
          color="primary"
          radius="full"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onPress={() => {
            Promise.resolve(engine.toggle()).catch((error: unknown) => addToast({
              title: 'Playback failed',
              description: error instanceof Error ? error.message : String(error),
              color: 'warning',
            }));
          }}
        >
          {isPlaying ? <HiPause className="h-5 w-5" /> : <HiPlay className="h-5 w-5" />}
        </Button>
        <span className="w-24 font-mono text-sm tabular-nums text-gray-700 dark:text-gray-200">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <Slider
          aria-label="Seek"
          size="sm"
          minValue={0}
          maxValue={Math.max(duration, 0.01)}
          step={0.1}
          value={currentTime}
          onChange={(value) => engine.seek(Array.isArray(value) ? value[0] : value)}
          className="min-w-40 flex-1"
        />
        <div className="flex w-36 items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Master</span>
          <Slider
            aria-label="Master volume"
            size="sm"
            minValue={0}
            maxValue={1.5}
            step={0.01}
            value={masterVolume}
            onChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              setMasterVolume(next);
              engine.setMasterVolume(next);
            }}
          />
        </div>
      </div>

      <StemPracticeBar
        engine={engine}
        practice={practice}
        pendingLoopStart={pendingLoopStart}
        onSetLoopPoint={setLoopPoint}
      />

      {tracks.map((track, index) => (
        <StemTrackRow
          key={track.name}
          engine={engine}
          track={track}
          anySolo={anySolo}
          position={position}
          loop={loopFractions}
          selected={index === selectedIndex}
          shortcutIndex={index < 9 ? index + 1 : undefined}
          downloadUrl={stemSet.stems.find((stem) => stem.name === track.name)?.url.concat('?download=1')}
          onSeek={seekFraction}
          onSelectRange={selectRange}
          onSelect={() => setSelectedIndex(index)}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="flat"
          startContent={<HiOutlineArrowDownTray className="h-4 w-4" />}
          isLoading={rendering === 'karaoke'}
          isDisabled={Boolean(rendering) || !tracks.some((track) => track.name === 'vocals')}
          onPress={() => void renderAndDownload('karaoke')}
        >
          Karaoke (no vocals, WAV)
        </Button>
        <Button
          size="sm"
          variant="flat"
          startContent={<HiOutlineArrowDownTray className="h-4 w-4" />}
          isLoading={rendering === 'mix'}
          isDisabled={Boolean(rendering)}
          onPress={() => void renderAndDownload('mix')}
        >
          Current mix (WAV)
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Single stems download as FLAC from each track. Mixes are rendered in your browser at the original tempo and pitch.
        </span>
        <Popover placement="top-end">
          <PopoverTrigger>
            <Button size="sm" variant="light" className="ml-auto" startContent={<HiOutlineCommandLine className="h-4 w-4" />}>
              Shortcuts
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {STEM_SHORTCUTS.map(([keys, action]) => (
                <React.Fragment key={keys}>
                  <dt className="font-mono font-semibold text-gray-800 dark:text-gray-100">{keys}</dt>
                  <dd className="text-gray-600 dark:text-gray-300">{action}</dd>
                </React.Fragment>
              ))}
            </dl>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default StemPlayer;
