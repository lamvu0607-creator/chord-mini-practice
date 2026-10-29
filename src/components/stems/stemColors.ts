export interface StemColor {
  label: string;
  /** Waveform fill (hex, used on canvas). */
  wave: string;
  /** Tailwind classes for the label chip. */
  chip: string;
}

const COLORS: Record<string, StemColor> = {
  vocals: { label: 'Vocals', wave: '#ec4899', chip: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300' },
  drums: { label: 'Drums', wave: '#f59e0b', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  bass: { label: 'Bass', wave: '#6366f1', chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  other: { label: 'Other', wave: '#10b981', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

export function getStemColor(name: string): StemColor {
  return COLORS[name] ?? {
    label: name.charAt(0).toUpperCase() + name.slice(1),
    wave: '#64748b',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
