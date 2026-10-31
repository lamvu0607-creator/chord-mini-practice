export const PLAYBACK_EVENT_BOUNDARY_TOLERANCE = 0.08;
export const PLAYBACK_EVENT_MISS_GRACE_PERIOD = 0.12;

export const PIANO_START_MIDI = 21;
export const PIANO_END_MIDI = 108;
export const PIANO_WHITE_KEY_COUNT = 52;

export const SPEED_PRESETS = [
  { label: 'Slow', lookAhead: 6, description: 'More time to read ahead' },
  { label: 'Normal', lookAhead: 4, description: 'Balanced view' },
  { label: 'Fast', lookAhead: 2, description: 'Compact, closer timing' },
] as const;

export type SpeedPreset = typeof SPEED_PRESETS[number];

export const MELODIC_TRANSCRIPTION_COLOR = '#22d3ee';
export const HARMONY_TRANSCRIPTION_COLOR = '#ec4899';
