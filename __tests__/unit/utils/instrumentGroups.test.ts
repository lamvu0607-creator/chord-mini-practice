import {
  INSTRUMENT_GROUP_COLORS,
  INSTRUMENT_GROUP_LABELS,
  INSTRUMENT_GROUP_MIDI_PROGRAMS,
  INSTRUMENT_GROUP_ORDER,
  MUSCRIPTOR_INSTRUMENT_GROUPS,
  instrumentGroupOf,
} from '@/utils/instrumentGroups';
import { buildSheetSageExtraVisualNotes } from '@/utils/sheetSagePlayback';
import type { SheetSageResult } from '@/types/sheetSage';

// MT3_FULL_PLUS_GROUP_NAMES from muscriptor/tokenizer/mt3.py (commit 8a1ef88), minus drums.
const MUSCRIPTOR_GROUP_NAMES = [
  'acoustic_piano', 'electric_piano', 'chromatic_percussion', 'organ', 'acoustic_guitar', 'clean_electric_guitar',
  'distorted_electric_guitar', 'acoustic_bass', 'electric_bass', 'violin', 'viola', 'cello', 'contrabass',
  'orchestral_harp', 'timpani', 'string_ensemble', 'synth_strings', 'voice', 'orchestra_hit', 'trumpet', 'trombone',
  'tuba', 'french_horn', 'brass_section', 'soprano_and_alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn',
  'bassoon', 'clarinet', 'flutes', 'synth_lead', 'synth_pad',
];

describe('instrument groups', () => {
  it('maps every MuScriptor group and falls back to other', () => {
    expect(Object.keys(MUSCRIPTOR_INSTRUMENT_GROUPS).sort()).toEqual([...MUSCRIPTOR_GROUP_NAMES].sort());
    expect(instrumentGroupOf('distorted_electric_guitar')).toBe('guitar');
    expect(instrumentGroupOf('electric_bass')).toBe('bass');
    expect(instrumentGroupOf('program_99')).toBe('other');
  });

  it('has a label, color and MIDI program for every layer', () => {
    for (const group of INSTRUMENT_GROUP_ORDER) {
      expect(INSTRUMENT_GROUP_LABELS[group]).toBeTruthy();
      expect(INSTRUMENT_GROUP_COLORS[group]).toMatch(/^#[0-9a-f]{6}$/);
      expect(INSTRUMENT_GROUP_MIDI_PROGRAMS[group]).toBeGreaterThanOrEqual(0);
    }
  });

  it('adds only enabled instrument layers to the piano-roll notes', () => {
    const result = {
      source: 'sheetsage', usedJukebox: false, beatTimes: [], beatsPerMeasure: 4, tempoBpm: 120,
      noteEvents: [{ onset: 0, offset: 1, pitch: 64, velocity: 90 }], noteEventCount: 1,
      instrumentNotes: [
        { onset: 0, offset: 1, pitch: 52, velocity: 80, instrument: 'acoustic_guitar', group: 'guitar' },
        { onset: 0, offset: 1, pitch: 40, velocity: 80, instrument: 'electric_bass', group: 'bass' },
      ],
    } as SheetSageResult;

    const vocalOnly = buildSheetSageExtraVisualNotes(result, '#22d3ee');
    expect(vocalOnly.map((note) => note.midi)).toEqual([64]);

    const withGuitar = buildSheetSageExtraVisualNotes(result, '#22d3ee', 0, '#ec4899', ['guitar']);
    expect(withGuitar).toEqual([
      { midi: 64, startTime: 0, endTime: 1, color: '#22d3ee', layer: 'vocal' },
      { midi: 52, startTime: 0, endTime: 1, color: INSTRUMENT_GROUP_COLORS.guitar, layer: 'guitar' },
    ]);
  });
});
