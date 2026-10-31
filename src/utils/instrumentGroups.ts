import type { InstrumentGroup } from '@/types/sheetSage';

/**
 * MuScriptor emits one of the MT3_FULL_PLUS group names per note (muscriptor/tokenizer/mt3.py,
 * MT3_FULL_PLUS_GROUP_NAMES). They are folded into a few piano-roll layers here; anything unknown
 * (including `program_<n>`) lands in `other`. Drums are dropped by the service.
 */
export const MUSCRIPTOR_INSTRUMENT_GROUPS: Record<string, InstrumentGroup> = {
  acoustic_piano: 'keys',
  electric_piano: 'keys',
  chromatic_percussion: 'keys',
  organ: 'keys',
  acoustic_guitar: 'guitar',
  clean_electric_guitar: 'guitar',
  distorted_electric_guitar: 'guitar',
  acoustic_bass: 'bass',
  electric_bass: 'bass',
  violin: 'strings',
  viola: 'strings',
  cello: 'strings',
  contrabass: 'strings',
  orchestral_harp: 'strings',
  timpani: 'other',
  string_ensemble: 'strings',
  synth_strings: 'synth',
  voice: 'other',
  orchestra_hit: 'other',
  trumpet: 'brass_winds',
  trombone: 'brass_winds',
  tuba: 'brass_winds',
  french_horn: 'brass_winds',
  brass_section: 'brass_winds',
  soprano_and_alto_sax: 'brass_winds',
  tenor_sax: 'brass_winds',
  baritone_sax: 'brass_winds',
  oboe: 'brass_winds',
  english_horn: 'brass_winds',
  bassoon: 'brass_winds',
  clarinet: 'brass_winds',
  flutes: 'brass_winds',
  synth_lead: 'synth',
  synth_pad: 'synth',
};

export const INSTRUMENT_GROUP_ORDER: InstrumentGroup[] = ['guitar', 'keys', 'bass', 'brass_winds', 'strings', 'synth', 'other'];

export const INSTRUMENT_GROUP_LABELS: Record<InstrumentGroup, string> = {
  guitar: 'Guitar',
  keys: 'Keys',
  bass: 'Bass',
  brass_winds: 'Winds',
  strings: 'Strings',
  synth: 'Synth',
  other: 'Other',
};

// Distinct from the vocal line (#22d3ee), harmony (#ec4899) and the chord-playback instrument colors.
export const INSTRUMENT_GROUP_COLORS: Record<InstrumentGroup, string> = {
  guitar: '#f59e0b',
  keys: '#d946ef',
  bass: '#b45309',
  brass_winds: '#e11d48',
  strings: '#7c3aed',
  synth: '#84cc16',
  other: '#94a3b8',
};

/** Layers shown by default: the vocal line plus guitar. */
export const DEFAULT_ENABLED_INSTRUMENT_GROUPS: InstrumentGroup[] = ['guitar'];

export function instrumentGroupOf(instrument: string): InstrumentGroup {
  return MUSCRIPTOR_INSTRUMENT_GROUPS[instrument] ?? 'other';
}

/** General MIDI program used when an instrument layer is exported as its own MIDI track. */
export const INSTRUMENT_GROUP_MIDI_PROGRAMS: Record<InstrumentGroup, number> = {
  guitar: 29, // Overdriven Guitar
  keys: 0, // Acoustic Grand Piano
  bass: 33, // Electric Bass (finger)
  brass_winds: 65, // Alto Sax
  strings: 48, // String Ensemble 1
  synth: 81, // Lead 2 (sawtooth)
  other: 0,
};
