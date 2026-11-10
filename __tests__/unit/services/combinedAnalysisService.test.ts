import { analyzeBeatsAndChords } from '@/services/audio/combinedAnalysisService';

const makeFile = () => new File([new Uint8Array(16)], 'song.wav', { type: 'audio/wav' });

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('analyzeBeatsAndChords', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('parses the nested beat and chord payloads', async () => {
    mockFetch(200, {
      success: true,
      beats: { success: true, beats: [0.5, 1, 1.5], downbeats: [0.5], bpm: 120, time_signature: '3/4', model_used: 'beat-this' },
      chords: {
        success: true,
        chords: [{ start: 0.5, end: 1.5, chord: 'A:min' }, { start: 2, end: 1, chord: 'bad' }],
        key: 'A:minor', key_confidence: 0.3, decoding: 'beat-sync',
      },
    });

    const result = await analyzeBeatsAndChords(makeFile(), 'beat-this', 'btc-cl');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/analyze-audio');
    const form = init.body as FormData;
    expect(form.get('beat_detector')).toBe('beat-this');
    expect(form.get('chord_detector')).toBe('btc-cl');
    expect(form.get('chord_dict')).toBe('large_voca');
    expect(result?.beatResults.beats).toEqual([0.5, 1, 1.5]);
    expect(result?.beatResults.time_signature).toBe(3);
    expect(result?.beatResults.model).toBe('beat-this');
    expect(result?.chordRecognition.chords).toHaveLength(1);
    expect(result?.chordRecognition.key).toBe('A:minor');
    expect(result?.chordRecognition.decoding).toBe('beat-sync');
  });

  it('returns null when the backend has no combined endpoint', async () => {
    mockFetch(404, { error: 'Not found' });
    await expect(analyzeBeatsAndChords(makeFile(), 'beat-this', 'btc-cl')).resolves.toBeNull();
  });

  it('returns null when a stage failed', async () => {
    mockFetch(500, { success: false, stage: 'beats', error: 'boom' });
    await expect(analyzeBeatsAndChords(makeFile(), 'madmom', 'btc-cl')).resolves.toBeNull();
  });

  it('returns null when the request itself fails', async () => {
    global.fetch = jest.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch;
    await expect(analyzeBeatsAndChords(makeFile(), 'beat-this', 'btc-cl')).resolves.toBeNull();
  });

  it('throws on size limits instead of retrying', async () => {
    mockFetch(413, { error: 'too large' });
    await expect(analyzeBeatsAndChords(makeFile(), 'beat-this', 'btc-cl')).rejects.toThrow('size');
  });
});
