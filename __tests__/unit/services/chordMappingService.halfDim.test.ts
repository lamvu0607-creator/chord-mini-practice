import { chordMappingService } from '@/services/chord-analysis/chordMappingService';

describe('chordMappingService half-diminished lookup', () => {
  it.each(['Bø7', 'B:hdim7', 'Bm7b5', 'Bø', 'B:min7b5'])('maps %s to the m7b5 shape', async (name) => {
    const data = await chordMappingService.getChordData(name);
    expect(data?.key).toBe('B');
    expect(data?.suffix).toBe('m7b5');
  });

  it('keeps dominant and fully diminished sevenths apart', async () => {
    expect((await chordMappingService.getChordData('B7'))?.suffix).toBe('7');
    expect((await chordMappingService.getChordData('B:dim7'))?.suffix).toBe('dim7');
  });

  it('uses the m7b5 name for the diagram label', () => {
    expect(chordMappingService.getPreferredDiagramChordName('F#ø7')).toBe('F#m7b5');
  });
});

describe('chordMappingService model (Harte) suffixes', () => {
  it.each([
    ['C:maj6', '6'],
    ['C:min6', 'm6'],
    ['C:min9', 'm9'],
    ['C:7(b9)', '7b9'],
    ['C:7(#9)', '7#9'],
    ['C:sus4(b7)', '7sus4'],
    ['C:maj6(9)', '69'],
    ['C:min(9)', 'madd9'],
    ['Cmaj7', 'maj7'],
    ['C:min7', 'm7'],
  ])('maps %s to the %s shape', async (name, suffix) => {
    expect((await chordMappingService.getChordData(name))?.suffix).toBe(suffix);
  });
});
