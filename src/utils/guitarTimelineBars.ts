/**
 * Groups the chord grid's per-beat arrays into bars for the Guitar tab's
 * bar-box Chord Timeline.
 *
 * Bars are fixed chunks of `beatsPerMeasure` from index 0, the same grouping
 * the ChordGrid uses (the grid arrays are already shifted and padded so that
 * index 0 starts a bar).
 */

export interface TimelineBeat {
  /** Index into the grid arrays. */
  beatIndex: number;
  /** Chord name to show, or '' for no chord. */
  chord: string;
  /** Beat time in seconds, or null for shift and padding cells without a time. */
  time: number | null;
  barIndex: number;
  beatInBar: number;
  /** The chord differs from the previous beat, so its name is shown at full size. */
  isChange: boolean;
  /** First beat of a bar that continues the previous bar's chord (shown as a small faded name). */
  isCarriedBarStart: boolean;
}

export interface TimelineBar {
  barIndex: number;
  firstBeatIndex: number;
  beatCount: number;
}

export interface TimelineBars {
  beats: TimelineBeat[];
  bars: TimelineBar[];
}

const NO_CHORD = new Set(['', 'N', 'N.C.', 'N/C', 'NC']);

export function isNoChord(chord: string | null | undefined): boolean {
  return !chord || NO_CHORD.has(chord);
}

export function buildTimelineBars(
  chords: string[],
  beatTimes: (number | null)[],
  beatsPerMeasure: number,
  normalize: (chord: string) => string = (chord) => chord,
): TimelineBars {
  const perBar = Math.max(1, Math.floor(beatsPerMeasure) || 1);
  const beats: TimelineBeat[] = [];
  const bars: TimelineBar[] = [];

  let previous = '';
  for (let i = 0; i < chords.length; i++) {
    const chord = isNoChord(chords[i]) ? '' : chords[i];
    const barIndex = Math.floor(i / perBar);
    const beatInBar = i % perBar;
    const normalized = chord ? normalize(chord) : '';
    const isChange = Boolean(chord) && normalized !== previous;

    if (beatInBar === 0) {
      bars.push({ barIndex, firstBeatIndex: i, beatCount: Math.min(perBar, chords.length - i) });
    }

    const time = beatTimes[i];
    beats.push({
      beatIndex: i,
      chord,
      time: typeof time === 'number' && Number.isFinite(time) && time >= 0 ? time : null,
      barIndex,
      beatInBar,
      isChange,
      isCarriedBarStart: beatInBar === 0 && Boolean(chord) && !isChange,
    });
    previous = normalized;
  }

  return { beats, bars };
}
