import { clampSeek, SEEK_STEP_SECONDS } from '@/utils/seekBy';

describe('clampSeek', () => {
  it('uses a 5 second step', () => {
    expect(SEEK_STEP_SECONDS).toBe(5);
  });

  it('moves forward and backward by the delta', () => {
    expect(clampSeek(30, 5, 200)).toBe(35);
    expect(clampSeek(30, -5, 200)).toBe(25);
  });

  it('never goes below 0', () => {
    expect(clampSeek(3, -5, 200)).toBe(0);
  });

  it('never goes past the duration', () => {
    expect(clampSeek(198, 5, 200)).toBe(200);
  });

  it('only clamps at 0 when the duration is unknown', () => {
    expect(clampSeek(500, 5, 0)).toBe(505);
    expect(clampSeek(500, 5, NaN)).toBe(505);
    expect(clampSeek(500, 5)).toBe(505);
  });

  it('treats an invalid current time as 0', () => {
    expect(clampSeek(NaN, 5, 100)).toBe(5);
  });
});
