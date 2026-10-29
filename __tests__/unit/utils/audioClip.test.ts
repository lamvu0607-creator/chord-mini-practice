import {
  MAX_CLIP_SECONDS,
  MIN_CLIP_SECONDS,
  buildClipFileName,
  computePeaks,
  defaultClipRange,
  formatClipTime,
  parseClipTime,
  validateClipRange,
} from '@/utils/audioClip';

describe('audioClip', () => {
  describe('validateClipRange', () => {
    it('accepts a range inside the limits', () => {
      expect(validateClipRange(30, 90, 240)).toBeNull();
    });

    it('rejects clips shorter than the minimum', () => {
      expect(validateClipRange(10, 10 + MIN_CLIP_SECONDS - 1, 240)).toMatch(/ít nhất/);
    });

    it('rejects clips longer than the maximum', () => {
      expect(validateClipRange(0, MAX_CLIP_SECONDS + 1, 600)).toMatch(/tối đa/);
    });

    it('rejects reversed and out-of-bounds ranges', () => {
      expect(validateClipRange(60, 30, 240)).not.toBeNull();
      expect(validateClipRange(-1, 30, 240)).not.toBeNull();
      expect(validateClipRange(200, 250, 240)).not.toBeNull();
    });
  });

  describe('defaultClipRange', () => {
    it('caps the default selection at the maximum clip length', () => {
      expect(defaultClipRange(600)).toEqual({ start: 0, end: MAX_CLIP_SECONDS });
      expect(defaultClipRange(42)).toEqual({ start: 0, end: 42 });
    });
  });

  describe('time formatting', () => {
    it('formats and parses m:ss values', () => {
      expect(formatClipTime(65)).toBe('1:05');
      expect(formatClipTime(65.5)).toBe('1:05.5');
      expect(parseClipTime('1:05')).toBe(65);
      expect(parseClipTime('1:05.5')).toBe(65.5);
      expect(parseClipTime('90')).toBe(90);
    });

    it('rejects malformed input', () => {
      expect(parseClipTime('')).toBeNull();
      expect(parseClipTime('1:75')).toBeNull();
      expect(parseClipTime('a:10')).toBeNull();
      expect(parseClipTime('1:2:3')).toBeNull();
    });
  });

  it('builds a clip file name from the source name and range', () => {
    expect(buildClipFileName('My Song.mp3', 65, 110)).toBe('My Song [1m05s-1m50s].wav');
    expect(buildClipFileName('', 0, 30)).toBe('audio [0m00s-0m30s].wav');
  });

  it('computes interleaved min/max peaks per bucket across channels', () => {
    const left = new Float32Array([0.1, -0.5, 0.2, 0.9]);
    const right = new Float32Array([-0.7, 0.3, 0, -0.1]);
    const peaks = computePeaks([left, right], 2);
    expect(Array.from(peaks)).toEqual([
      expect.closeTo(-0.7), expect.closeTo(0.3),
      expect.closeTo(-0.1), expect.closeTo(0.9),
    ]);
  });
});
