/** Default step (seconds) for the rewind / fast-forward controls and shortcuts. */
export const SEEK_STEP_SECONDS = 5;

/**
 * Returns `current + delta` clamped to `[0, duration]`.
 * An unknown duration (0, NaN, undefined) only clamps at 0.
 */
export function clampSeek(current: number, delta: number, duration?: number | null): number {
  const base = Number.isFinite(current) ? current : 0;
  const max = duration && Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  return Math.max(0, Math.min(max, base + delta));
}
