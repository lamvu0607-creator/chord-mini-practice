'use client';

import React from 'react';
import { Slider, Tooltip } from '@heroui/react';
import { HiOutlineArrowDownTray } from 'react-icons/hi2';
import type { StemMixerEngine, StemTrackState } from '@/services/stems/stemMixerEngine';
import StemWaveform from './StemWaveform';
import { getStemColor } from './stemColors';

interface StemTrackRowProps {
  engine: StemMixerEngine;
  track: StemTrackState;
  anySolo: boolean;
  position: number;
  loop?: { start: number; end: number; enabled: boolean } | null;
  selected?: boolean;
  shortcutIndex?: number;
  downloadUrl?: string;
  onSeek: (fraction: number) => void;
  onSelectRange?: (start: number, end: number) => void;
  onSelect?: () => void;
}

const toggleClass = (active: boolean, activeClass: string) => `h-11 w-11 flex-shrink-0 md:h-8 md:w-8 rounded-md text-xs font-bold border transition-colors ${
  active ? activeClass : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
}`;

const StemTrackRow: React.FC<StemTrackRowProps> = ({
  engine, track, anySolo, position, loop, selected, shortcutIndex, downloadUrl, onSeek, onSelectRange, onSelect,
}) => {
  const color = getStemColor(track.name);
  const audible = !track.muted && (!anySolo || track.soloed);

  return (
    <div
      onPointerDownCapture={onSelect}
      className={`flex flex-col gap-2 rounded-xl border bg-content1/90 p-2 md:p-3 backdrop-blur-md dark:bg-white/[0.06] sm:flex-row sm:items-center ${
        selected ? 'border-blue-400 ring-1 ring-blue-400/60 dark:border-blue-500' : 'border-divider dark:border-white/10'
      }`}
    >
      <div className="flex w-full items-center gap-2 sm:w-80 sm:flex-shrink-0">
        <span className={`inline-flex min-w-16 justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${color.chip}`}>
          {shortcutIndex !== undefined && <span className="mr-1 hidden opacity-60 md:inline">{shortcutIndex}</span>}
          {color.label}
        </span>
        <Tooltip content="Mute (M)" delay={400}>
          <button
            type="button"
            aria-pressed={track.muted}
            className={toggleClass(track.muted, 'border-red-400 bg-red-500 text-white')}
            onClick={() => engine.setMuted(track.name, !track.muted)}
          >M</button>
        </Tooltip>
        <Tooltip content="Solo (S)" delay={400}>
          <button
            type="button"
            aria-pressed={track.soloed}
            className={toggleClass(track.soloed, 'border-yellow-400 bg-yellow-400 text-gray-900')}
            onClick={() => engine.setSoloed(track.name, !track.soloed)}
          >S</button>
        </Tooltip>
        <Slider
          aria-label={`${color.label} volume`}
          size="sm"
          minValue={0}
          maxValue={1.5}
          step={0.01}
          value={track.volume}
          onChange={(value) => engine.setVolume(track.name, Array.isArray(value) ? value[0] : value)}
          className="min-w-20 flex-1"
        />
        {downloadUrl && (
          <Tooltip content={`Download ${color.label} (FLAC)`} delay={400}>
            <a
              href={downloadUrl}
              className="inline-flex h-11 w-11 flex-shrink-0 md:h-8 md:w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-white"
              aria-label={`Download ${color.label}`}
            >
              <HiOutlineArrowDownTray className="h-4 w-4" />
            </a>
          </Tooltip>
        )}
      </div>
      <StemWaveform
        engine={engine}
        stemName={track.name}
        color={color.wave}
        dimmed={!audible}
        position={position}
        loop={loop}
        onSeek={onSeek}
        onSelectRange={onSelectRange}
      />
    </div>
  );
};

export default StemTrackRow;
