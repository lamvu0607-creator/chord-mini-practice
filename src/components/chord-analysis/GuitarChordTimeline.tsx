'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChordCell } from '@/components/chord-analysis/ChordCell';
import { GridLyricText, type BeatGridTimedLyrics } from '@/components/chord-analysis/GridLyricsRow';
import {
  getTimelineVisibleRange,
  getUniformBeatWidthFromIntervals,
  isTimelineBoxVisible,
  normalizeChordName,
} from '@/components/piano-visualizer/ScrollingChordStrip';
import { useSweepLineScroll } from '@/hooks/ui/useSweepLineScroll';
import { useBeatHandlers, useCurrentBeatIndex, useCurrentTime, useIsPlaying } from '@/stores/playbackStore';
import { buildTimelineBars, type TimelineBeat } from '@/utils/guitarTimelineBars';
import { formatChordWithMusicalSymbols, getChordLabelStyles } from '@/utils/chordFormatting';

interface GuitarChordTimelineProps {
  /** Chord name per grid beat, already in the form the diagrams use (capo shape names). */
  chords: string[];
  /** Beat time per grid beat, null for shift or padding cells. */
  beatTimes: (number | null)[];
  timeSignature: number;
  accidentalPreference?: 'sharp' | 'flat' | null;
  gridLyrics?: BeatGridTimedLyrics | null;
  /** Same scale as the Piano tab's chord strip. */
  pixelsPerSecond?: number;
}

const SWEEP_LINE_FRACTION = 0.2;
const BAR_NUMBER_HEIGHT = 16;
const BAR_HEIGHT = 54;
const BAR_GAP = 4;
/** Left bar line (3px) + right border (1px), matching ChordGrid's measure separator. */
const BAR_BORDER_X = 4;
const LYRICS_HEIGHT = 24;

const noop = () => {};
const layoutOnlyStyle = () => 'relative flex flex-col items-center justify-center';
const fontWeightOnly = () => 'font-semibold';

/**
 * Guitar tab Chord Timeline: one box per bar with equal-width beats, scrolling
 * under a fixed sweep line like the Piano tab's chord strip. A chord name is
 * shown where the chord changes; a bar that continues the previous bar's chord
 * repeats its name once, small and faded.
 */
export const GuitarChordTimeline: React.FC<GuitarChordTimelineProps> = ({
  chords,
  beatTimes,
  timeSignature,
  accidentalPreference = null,
  gridLyrics = null,
  pixelsPerSecond = 118,
}) => {
  const currentTime = useCurrentTime();
  const isPlaying = useIsPlaying();
  const currentBeatIndex = useCurrentBeatIndex();
  const { onBeatClick } = useBeatHandlers();

  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth((prev) => (Math.abs(prev - entry.contentRect.width) >= 1 ? entry.contentRect.width : prev));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sweepLineX = containerWidth * SWEEP_LINE_FRACTION;

  const { beats, bars } = useMemo(
    () => buildTimelineBars(chords, beatTimes, timeSignature, (c) => normalizeChordName(c, accidentalPreference)),
    [chords, beatTimes, timeSignature, accidentalPreference],
  );

  const { beatWidth, timeToX, totalWidth } = useMemo(() => {
    const timed = beats.filter((b): b is TimelineBeat & { time: number } => b.time !== null);
    const durations = timed.slice(1).map((b, i) => (b.time - timed[i].time) / Math.max(1, b.beatIndex - timed[i].beatIndex));
    const width = getUniformBeatWidthFromIntervals(durations, pixelsPerSecond, timeSignature);
    const sorted = [...durations].filter((d) => d > 0).sort((a, b) => a - b);
    const medianBeat = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0.5;

    const mapTime = (time: number): number => {
      if (timed.length === 0) return 0;
      if (time <= timed[0].time) return timed[0].beatIndex * width;
      const last = timed[timed.length - 1];
      if (time >= last.time) return (last.beatIndex + (time - last.time) / medianBeat) * width;
      let lo = 0;
      let hi = timed.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >>> 1;
        if (timed[mid].time <= time) lo = mid; else hi = mid;
      }
      const a = timed[lo];
      const b = timed[hi];
      const fraction = (time - a.time) / Math.max(1e-6, b.time - a.time);
      return (a.beatIndex + fraction * (b.beatIndex - a.beatIndex)) * width;
    };

    return { beatWidth: width, timeToX: mapTime, totalWidth: beats.length * width };
  }, [beats, pixelsPerSecond, timeSignature]);

  useSweepLineScroll(innerRef, { currentTime, isPlaying, sweepLineX, timeToX });

  const visibleRange = useMemo(
    () => getTimelineVisibleRange(timeToX(currentTime), containerWidth, sweepLineX),
    [timeToX, currentTime, containerWidth, sweepLineX],
  );

  const visibleBars = useMemo(
    () => bars.filter((bar) => isTimelineBoxVisible(
      { x: bar.firstBeatIndex * beatWidth, width: bar.beatCount * beatWidth },
      visibleRange,
    )),
    [bars, beatWidth, visibleRange],
  );

  const handleBeatClick = useCallback((beat: TimelineBeat) => {
    if (beat.time !== null && onBeatClick) onBeatClick(beat.beatIndex, beat.time);
  }, [onBeatClick]);

  const lyricLines = gridLyrics?.lyrics?.lines ?? [];
  const hasLyrics = lyricLines.length > 0;
  const height = BAR_NUMBER_HEIGHT + BAR_HEIGHT + 4 + (hasLyrics ? LYRICS_HEIGHT : 0);
  const currentBarIndex = currentBeatIndex >= 0 && currentBeatIndex < beats.length
    ? beats[currentBeatIndex].barIndex
    : -1;

  if (beats.length === 0) {
    return (
      <div ref={containerRef} className="flex h-16 items-center justify-center">
        <span className="font-varela text-xs text-gray-500">No chords detected</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="guitar-chord-timeline relative overflow-hidden rounded-sm"
      style={{ height }}
      data-testid="guitar-chord-timeline"
    >
      <div
        ref={innerRef}
        className="absolute bottom-0 top-0"
        style={{ width: totalWidth + containerWidth, willChange: 'transform' }}
      >
        {visibleBars.map((bar) => {
          const left = bar.firstBeatIndex * beatWidth;
          const boxWidth = bar.beatCount * beatWidth - BAR_GAP;
          const cellWidth = (boxWidth - BAR_BORDER_X) / bar.beatCount;
          const isCurrentBar = bar.barIndex === currentBarIndex;
          return (
            <React.Fragment key={bar.barIndex}>
              <div
                className="absolute select-none font-mono text-[11px] leading-none text-gray-500 dark:text-gray-400"
                style={{ left: left + 6, top: 2 }}
              >
                {bar.barIndex + 1}
              </div>
              <div
                className={`absolute overflow-hidden rounded border border-l-[3px] border-gray-300 border-l-gray-600 bg-white dark:border-gray-600 dark:border-l-gray-400 dark:bg-content-bg ${isCurrentBar ? 'shadow-[0_0_0_2px_rgba(96,165,250,0.5)]' : ''}`}
                style={{ left: left + BAR_GAP / 2, top: BAR_NUMBER_HEIGHT, width: boxWidth, height: BAR_HEIGHT }}
                data-bar-index={bar.barIndex}
              >
                {beats.slice(bar.firstBeatIndex, bar.firstBeatIndex + bar.beatCount).map((beat) => (
                  <TimelineBeatCell
                    key={beat.beatIndex}
                    beat={beat}
                    left={beat.beatInBar * cellWidth}
                    width={cellWidth}
                    isActive={beat.beatIndex === currentBeatIndex}
                    isPast={currentBeatIndex >= 0 && beat.beatIndex < currentBeatIndex}
                    accidentalPreference={accidentalPreference}
                    onClick={handleBeatClick}
                  />
                ))}
              </div>
            </React.Fragment>
          );
        })}

        {hasLyrics && lyricLines.map((line) => {
          const x = timeToX(line.startTime);
          if (x + 300 < visibleRange.startX || x > visibleRange.endX) return null;
          return (
            <div
              key={`${line.startTime}-${x}`}
              className="absolute whitespace-nowrap text-left font-varela font-semibold"
              style={{ left: x + 4, top: BAR_NUMBER_HEIGHT + BAR_HEIGHT + 4, height: 22, fontSize: '15px', lineHeight: '1.2' }}
            >
              <GridLyricText line={line} mode={gridLyrics!.mode} />
            </div>
          );
        })}
      </div>

      {/* Sweep line */}
      <div className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: sweepLineX - 1 }}>
        <div className="h-full w-0.5 bg-blue-400/80 shadow-[0_0_8px_2px_rgba(96,165,250,0.4)]" />
      </div>

      {/* Edge fades */}
      <div
        className="pointer-events-none absolute inset-0 z-20 dark:hidden"
        style={{ background: 'linear-gradient(to right, rgb(255 255 255) 0%, transparent 8%, transparent 92%, rgb(255 255 255) 100%)' }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-20 hidden dark:block"
        style={{ background: 'linear-gradient(to right, rgb(24 24 27) 0%, transparent 8%, transparent 92%, rgb(24 24 27) 100%)' }}
      />
    </div>
  );
};

interface TimelineBeatCellProps {
  beat: TimelineBeat;
  left: number;
  width: number;
  isActive: boolean;
  isPast: boolean;
  accidentalPreference: 'sharp' | 'flat' | null;
  onClick: (beat: TimelineBeat) => void;
}

const TimelineBeatCell = React.memo<TimelineBeatCellProps>(({
  beat,
  left,
  width,
  isActive,
  isPast,
  accidentalPreference,
  onClick,
}) => {
  const showLabel = beat.isChange || beat.isCarriedBarStart;
  const isGhost = beat.isCarriedBarStart;
  const stateClass = isActive
    ? 'z-[2] rounded-sm bg-blue-50 text-blue-800 shadow-[inset_0_0_0_2px_rgb(96_165_250)] dark:bg-blue-900/50 dark:text-blue-100 dark:shadow-[inset_0_0_0_2px_rgb(59_130_246)]'
    : isPast
      ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
      : !beat.chord
        ? 'bg-gray-50 dark:bg-gray-800/50'
        : 'text-gray-800 dark:text-gray-100';
  const overflowCells = beat.isChange
    ? (beat.chord.length >= 9 ? 2 : beat.chord.length >= 5 ? 1 : 0)
    : 0;

  return (
    <div
      role="button"
      tabIndex={beat.time === null ? -1 : 0}
      aria-label={`Bar ${beat.barIndex + 1}, beat ${beat.beatInBar + 1}: ${beat.chord || 'No chord'}`}
      className={`absolute bottom-0 top-0 cursor-pointer overflow-visible focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${beat.beatInBar > 0 ? 'border-l border-gray-200/80 dark:border-white/10' : ''} ${stateClass}`}
      style={{ left, width }}
      onClick={() => onClick(beat)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(beat);
        }
      }}
      data-beat-index={beat.beatIndex}
      data-label={showLabel ? (isGhost ? 'carried' : 'change') : undefined}
    >
      {isGhost && (
        <div
          className={`flex h-full items-center whitespace-nowrap pl-1.5 font-varela text-[11px] font-medium ${isActive ? 'opacity-75' : 'opacity-50'}`}
          style={getChordLabelStyles()}
          dangerouslySetInnerHTML={{
            __html: formatChordWithMusicalSymbols(beat.chord, false, accidentalPreference ?? undefined),
          }}
        />
      )}
      {showLabel && !isGhost && (
        <div className="h-full">
          <ChordCell
            compact
            chord={beat.chord}
            globalIndex={beat.beatIndex}
            displayChord={beat.chord}
            isEmpty={false}
            wasCorrected={false}
            cellSize={BAR_HEIGHT - 2}
            showChordLabel
            isClickable={false}
            onBeatClick={noop}
            getChordStyle={layoutOnlyStyle}
            getDynamicFontSize={fontWeightOnly}
            accidentalPreference={accidentalPreference ?? undefined}
            labelOverflowCells={overflowCells}
            labelOverflowGapPx={0}
          />
        </div>
      )}
    </div>
  );
});

TimelineBeatCell.displayName = 'TimelineBeatCell';

export default GuitarChordTimeline;
