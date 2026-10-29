/**
 * Browser-side audio clipping: decode a source file, cut [start, end] and
 * re-encode it as a mono WAV File that the regular upload pipeline can analyze.
 */

import { audioBufferToWav } from '@/utils/audioBufferUtils';

export const MIN_CLIP_SECONDS = 5;
export const MAX_CLIP_SECONDS = 180;
export const CLIP_SAMPLE_RATE = 44100;

export function formatClipTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const wholeSeconds = Math.floor(rest);
  const tenths = Math.floor((rest - wholeSeconds) * 10);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}${tenths ? `.${tenths}` : ''}`;
}

/** Parses "m:ss", "m:ss.s" or plain seconds; returns null when invalid. */
export function parseClipTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length > 2) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (numbers.length === 1) return numbers[0];
  if (numbers[1] >= 60) return null;
  return numbers[0] * 60 + numbers[1];
}

export function validateClipRange(start: number, end: number, duration: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Thời gian không hợp lệ.';
  if (start < 0 || end > duration + 0.05) return 'Đoạn chọn nằm ngoài độ dài audio.';
  if (end <= start) return 'Thời điểm kết thúc phải sau thời điểm bắt đầu.';
  const length = end - start;
  if (length < MIN_CLIP_SECONDS) return `Đoạn cắt phải dài ít nhất ${MIN_CLIP_SECONDS} giây.`;
  if (length > MAX_CLIP_SECONDS + 0.05) return `Đoạn cắt tối đa ${MAX_CLIP_SECONDS / 60} phút.`;
  return null;
}

/** Default selection: the first MAX_CLIP_SECONDS (or the whole file when shorter). */
export function defaultClipRange(duration: number): { start: number; end: number } {
  return { start: 0, end: Math.min(duration, MAX_CLIP_SECONDS) };
}

function compactTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds - minutes * 60);
  return `${minutes}m${String(rest).padStart(2, '0')}s`;
}

export function buildClipFileName(sourceName: string, start: number, end: number): string {
  const base = sourceName.replace(/\.[^./\\]+$/, '').trim() || 'audio';
  return `${base} [${compactTime(start)}-${compactTime(end)}].wav`;
}

/**
 * Interleaved [min, max] pairs per bucket across all channels, the same layout
 * StemWaveform draws.
 */
export function computePeaks(channels: Float32Array[], buckets: number): Float32Array {
  const peaks = new Float32Array(buckets * 2);
  const length = channels[0]?.length ?? 0;
  if (length === 0 || buckets <= 0) return peaks;
  const samplesPerBucket = length / buckets;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const from = Math.floor(bucket * samplesPerBucket);
    const to = Math.min(length, Math.max(from + 1, Math.floor((bucket + 1) * samplesPerBucket)));
    let min = 0;
    let max = 0;
    for (const channel of channels) {
      for (let index = from; index < to; index += 1) {
        const value = channel[index];
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    peaks[bucket * 2] = min;
    peaks[bucket * 2 + 1] = max;
  }
  return peaks;
}

export async function decodeAudioFile(file: Blob): Promise<AudioBuffer> {
  const AudioContextCtor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('Trình duyệt không hỗ trợ Web Audio.');
  const context = new AudioContextCtor();
  try {
    const data = await file.arrayBuffer();
    return await context.decodeAudioData(data);
  } catch (error) {
    throw new Error(`Không giải mã được file audio: ${error instanceof Error ? error.message : 'định dạng không hỗ trợ'}`);
  } finally {
    void context.close().catch(() => undefined);
  }
}

/** Cuts [start, end] out of `buffer`, downmixes to mono and resamples in one offline render. */
export async function sliceToMonoWav(
  buffer: AudioBuffer,
  start: number,
  end: number,
  fileName: string,
  sampleRate = CLIP_SAMPLE_RATE,
): Promise<File> {
  const error = validateClipRange(start, end, buffer.duration);
  if (error) throw new Error(error);
  const clipLength = Math.min(end, buffer.duration) - start;
  const frameCount = Math.max(1, Math.round(clipLength * sampleRate));
  const offline = new OfflineAudioContext(1, frameCount, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0, start, clipLength);
  const rendered = await offline.startRendering();
  const wav = await audioBufferToWav(rendered);
  return new File([wav], fileName, { type: 'audio/wav' });
}
