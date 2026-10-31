'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Spinner } from '@heroui/react';
import {
  MAX_CLIP_SECONDS,
  MIN_CLIP_SECONDS,
  buildClipFileName,
  computePeaks,
  decodeAudioFile,
  defaultClipRange,
  formatClipTime,
  parseClipTime,
  sliceToMonoWav,
  validateClipRange,
} from '@/utils/audioClip';

interface AudioClipSelectorProps {
  /** Full source audio (an uploaded file or a downloaded YouTube track). */
  file: File;
  /** Name used for the clip file; defaults to the source file name. */
  sourceName?: string;
  disabled?: boolean;
  /** May be async (e.g. uploads the clip); the cut button keeps spinning until it settles. */
  onClipReady: (clip: File, range: { start: number; end: number }) => void | Promise<void>;
  onCancel: () => void;
  confirmLabel?: string;
}

/** Pointer travel (px) that turns a click into a range drag (same as StemWaveform). */
const DRAG_THRESHOLD_PX = 4;
const PEAK_BUCKETS = 800;

const AudioClipSelector: React.FC<AudioClipSelectorProps> = ({ file, sourceName, disabled, onClipReady, onCancel, confirmLabel = 'Trim this section' }) => {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [startText, setStartText] = useState('0:00');
  const [endText, setEndText] = useState('0:00');
  const [isCutting, setIsCutting] = useState(false);
  const [cutError, setCutError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLAudioElement>(null);
  const dragOrigin = useRef<{ x: number; time: number } | null>(null);

  const duration = buffer?.duration ?? 0;

  const applyRange = useCallback((start: number, end: number) => {
    setRange({ start, end });
    setStartText(formatClipTime(start));
    setEndText(formatClipTime(end));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBuffer(null);
    setDecodeError(null);
    setCutError(null);
    decodeAudioFile(file)
      .then((decoded) => {
        if (cancelled) return;
        setBuffer(decoded);
        const initial = defaultClipRange(decoded.duration);
        applyRange(initial.start, initial.end);
      })
      .catch((error: unknown) => {
        if (!cancelled) setDecodeError(error instanceof Error ? error.message : 'Could not decode the audio file.');
      });
    return () => { cancelled = true; };
  }, [file, applyRange]);

  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const peaks = useMemo(() => {
    if (!buffer) return null;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    return computePeaks(channels, PEAK_BUCKETS);
  }, [buffer]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [buffer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || width <= 0) return;
    const height = canvas.clientHeight || 80;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);

    let maxAbs = 0.0001;
    for (const value of peaks) maxAbs = Math.max(maxAbs, Math.abs(value));
    const scale = Math.min(1, 0.98 / maxAbs) * (height / 2);
    const middle = height / 2;
    const columns = Math.max(1, Math.floor(width / 2));
    context.fillStyle = getComputedStyle(canvas).color;
    for (let column = 0; column < columns; column += 1) {
      const bucket = Math.min(PEAK_BUCKETS - 1, Math.floor((column / columns) * PEAK_BUCKETS));
      const top = middle - peaks[bucket * 2 + 1] * scale;
      const bottom = middle - peaks[bucket * 2] * scale;
      context.fillRect(column * 2, top, 1.5, Math.max(1, bottom - top));
    }
  }, [peaks, width]);

  const stopPreview = useCallback(() => {
    previewRef.current?.pause();
    setIsPreviewing(false);
    setPreviewPosition(null);
  }, []);

  // Stop the preview at the end of the selection.
  useEffect(() => {
    const audio = previewRef.current;
    if (!audio || !isPreviewing) return undefined;
    const handleTime = () => {
      setPreviewPosition(audio.currentTime);
      if (audio.currentTime >= range.end) stopPreview();
    };
    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('ended', stopPreview);
    return () => {
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('ended', stopPreview);
    };
  }, [isPreviewing, range.end, stopPreview]);

  useEffect(() => stopPreview, [file, stopPreview]);

  const togglePreview = () => {
    const audio = previewRef.current;
    if (!audio) return;
    if (isPreviewing) {
      stopPreview();
      return;
    }
    audio.currentTime = range.start;
    void audio.play().then(() => setIsPreviewing(true)).catch(() => setIsPreviewing(false));
  };

  const timeAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration;
  };

  const clampLength = (start: number, end: number) => ({ start, end: Math.min(end, start + MAX_CLIP_SECONDS) });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !buffer) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { x: event.clientX, time: timeAt(event) };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || Math.abs(event.clientX - origin.x) < DRAG_THRESHOLD_PX) return;
    const current = timeAt(event);
    const next = clampLength(Math.min(origin.time, current), Math.max(origin.time, current));
    applyRange(next.start, next.end);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    if (!origin || Math.abs(event.clientX - origin.x) >= DRAG_THRESHOLD_PX) return;
    // Plain click: move the selection so it starts here, keeping its length.
    const length = range.end - range.start;
    const start = Math.max(0, Math.min(origin.time, duration - length));
    applyRange(start, start + length);
  };

  const commitText = (which: 'start' | 'end') => {
    const parsed = parseClipTime(which === 'start' ? startText : endText);
    if (parsed === null) {
      applyRange(range.start, range.end);
      return;
    }
    const value = Math.min(parsed, duration);
    if (which === 'start') applyRange(value, range.end);
    else applyRange(range.start, value);
  };

  const rangeError = buffer ? validateClipRange(range.start, range.end, duration) : null;
  const tooShortToClip = buffer !== null && duration < MIN_CLIP_SECONDS;

  const handleCut = async () => {
    if (!buffer || rangeError) return;
    stopPreview();
    setIsCutting(true);
    setCutError(null);
    try {
      const clip = await sliceToMonoWav(buffer, range.start, range.end, buildClipFileName(sourceName || file.name, range.start, range.end));
      await onClipReady(clip, range);
    } catch (error) {
      setCutError(error instanceof Error ? error.message : 'Trimming the audio failed.');
    } finally {
      setIsCutting(false);
    }
  };

  if (decodeError) {
    return (
      <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-800 dark:bg-danger-900/20 dark:text-danger-300">
        {decodeError}
      </div>
    );
  }

  if (!buffer) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
        <Spinner size="sm" /> Reading audio to draw the waveform...
      </div>
    );
  }

  const fraction = (time: number) => (duration > 0 ? (time / duration) * 100 : 0);

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white/70 p-3 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
          Choose the section to analyze
          <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
            drag on the waveform, or enter times ({MIN_CLIP_SECONDS} s – {MAX_CLIP_SECONDS / 60} min)
          </span>
        </p>
        <span className="text-xs text-gray-500 dark:text-gray-400">Total: {formatClipTime(duration)}</span>
      </div>

      <div
        ref={containerRef}
        className={`relative h-20 w-full select-none overflow-hidden rounded-md bg-gray-100 text-blue-500 dark:bg-gray-800/80 dark:text-blue-400 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { dragOrigin.current = null; }}
        role="slider"
        aria-label="Waveform, drag to choose the section to analyze"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(range.start)}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-y-0 left-0 bg-gray-100/70 dark:bg-gray-900/70" style={{ width: `${fraction(range.start)}%` }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 bg-gray-100/70 dark:bg-gray-900/70" style={{ width: `${100 - fraction(range.end)}%` }} />
        <div
          className="pointer-events-none absolute inset-y-0 border-x-2 border-blue-600 bg-blue-500/10 dark:border-blue-400"
          style={{ left: `${fraction(range.start)}%`, width: `${fraction(range.end) - fraction(range.start)}%` }}
        />
        {previewPosition !== null && (
          <div className="pointer-events-none absolute inset-y-0 w-px bg-gray-900 dark:bg-white" style={{ left: `${fraction(previewPosition)}%` }} />
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Start"
          size="sm"
          className="w-28"
          value={startText}
          isDisabled={disabled}
          onValueChange={setStartText}
          onBlur={() => commitText('start')}
          onKeyDown={(event) => { if (event.key === 'Enter') commitText('start'); }}
        />
        <Input
          label="End"
          size="sm"
          className="w-28"
          value={endText}
          isDisabled={disabled}
          onValueChange={setEndText}
          onBlur={() => commitText('end')}
          onKeyDown={(event) => { if (event.key === 'Enter') commitText('end'); }}
        />
        <span className="pb-2 text-sm text-gray-600 dark:text-gray-300">
          Length: <strong>{formatClipTime(Math.max(0, range.end - range.start))}</strong>
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="flat" onPress={togglePreview} isDisabled={disabled || Boolean(rangeError)}>
            {isPreviewing ? 'Stop' : 'Preview section'}
          </Button>
          <Button size="sm" variant="flat" onPress={() => { stopPreview(); onCancel(); }} isDisabled={isCutting}>
            Cancel
          </Button>
          <Button
            size="sm"
            color="primary"
            onPress={() => void handleCut()}
            isDisabled={disabled || Boolean(rangeError) || tooShortToClip}
            isLoading={isCutting}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>

      {(rangeError || cutError) && (
        <p className="text-sm text-danger-600 dark:text-danger-400">{cutError || rangeError}</p>
      )}

      <audio ref={previewRef} src={previewUrl} preload="auto" className="hidden" />
    </div>
  );
};

export default AudioClipSelector;
