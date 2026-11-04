'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { StemMixerEngine } from '@/services/stems/stemMixerEngine';

interface StemWaveformProps {
  engine: StemMixerEngine;
  stemName: string;
  color: string;
  dimmed: boolean;
  /** 0..1 playhead position. */
  position: number;
  /** Active loop as fractions of the song, drawn as a band. */
  loop?: { start: number; end: number; enabled: boolean } | null;
  onSeek: (fraction: number) => void;
  /** Called when the user drags across the waveform to pick a loop region. */
  onSelectRange?: (start: number, end: number) => void;
}

/** Pointer travel (px) that turns a click into a range drag. */
const DRAG_THRESHOLD_PX = 4;

/** Static waveform drawn once per size; only the playhead overlay moves while playing. */
const StemWaveform: React.FC<StemWaveformProps> = ({ engine, stemName, color, dimmed, position, loop, onSeek, onSelectRange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const dragOrigin = useRef<{ x: number; fraction: number } | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const height = canvas.clientHeight || 56;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);

    const buckets = Math.max(1, Math.floor(width / 2));
    const peaks = engine.getPeaks(stemName, buckets);
    let maxAbs = 0.0001;
    for (const value of peaks) maxAbs = Math.max(maxAbs, Math.abs(value));
    const scale = Math.min(1, 0.98 / maxAbs) * (height / 2);
    const middle = height / 2;
    context.fillStyle = color;
    for (let bucket = 0; bucket < buckets; bucket += 1) {
      const top = middle - peaks[bucket * 2 + 1] * scale;
      const bottom = middle - peaks[bucket * 2] * scale;
      context.fillRect(bucket * 2, top, 1.5, Math.max(1, bottom - top));
    }
  }, [engine, stemName, color, width]);

  const fractionAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { x: event.clientX, fraction: fractionAt(event) };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || !onSelectRange || Math.abs(event.clientX - origin.x) < DRAG_THRESHOLD_PX) return;
    const current = fractionAt(event);
    setSelection({ start: Math.min(origin.fraction, current), end: Math.max(origin.fraction, current) });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    setSelection(null);
    if (!origin) return;
    const current = fractionAt(event);
    if (onSelectRange && Math.abs(event.clientX - origin.x) >= DRAG_THRESHOLD_PX) {
      onSelectRange(Math.min(origin.fraction, current), Math.max(origin.fraction, current));
    } else {
      onSeek(current);
    }
  };

  const band = selection ?? (loop ? { start: loop.start, end: loop.end } : null);
  const bandActive = Boolean(selection) || Boolean(loop?.enabled);

  return (
    <div
      ref={containerRef}
      // touch-pan-y: a vertical swipe still scrolls the page, a sideways drag picks a loop.
      className={`relative h-10 w-full cursor-pointer touch-pan-y select-none md:h-14 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-900/60 transition-opacity ${dimmed ? 'opacity-30' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { dragOrigin.current = null; setSelection(null); }}
      role="slider"
      aria-label={`${stemName} waveform, click to seek, drag to loop`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position * 100)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {band && (
        <div
          className={`pointer-events-none absolute inset-y-0 border-x ${
            bandActive
              ? 'border-blue-500 bg-blue-500/20 dark:bg-blue-400/20'
              : 'border-gray-400 border-dashed bg-gray-400/10'
          }`}
          style={{ left: `${band.start * 100}%`, width: `${(band.end - band.start) * 100}%` }}
        />
      )}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-white/40 dark:bg-black/40"
        style={{ width: `${position * 100}%` }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-gray-900 dark:bg-white"
        style={{ left: `${position * 100}%` }}
      />
    </div>
  );
};

export default StemWaveform;
