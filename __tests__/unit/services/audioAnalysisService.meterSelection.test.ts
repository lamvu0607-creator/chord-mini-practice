import { analyzeAudioWithRateLimit, buildChordBeatGrid } from '@/services/audio/audioAnalysisService';
import { detectBeatsWithRateLimit } from '@/services/audio/beatDetectionService';
import { recognizeChordsDetailed } from '@/services/chord-analysis/chordService';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';

jest.mock('@/utils/audioDurationUtils', () => ({
  getAudioDurationFromFile: jest.fn(),
}));

jest.mock('@/utils/analysisDurationLimit', () => ({
  getAnalysisDurationLimitReason: jest.fn(() => null),
}));

jest.mock('@/services/audio/beatDetectionService', () => ({
  detectBeatsFromFile: jest.fn(),
  detectBeatsWithRateLimit: jest.fn(),
}));

jest.mock('@/services/chord-analysis/chordService', () => ({
  recognizeChordsWithRateLimit: jest.fn(),
  recognizeChordsDetailed: jest.fn(),
}));

jest.mock('@/workers/chordAnalysisClient', () => ({
  getChordAnalysisWorker: jest.fn(() => null),
}));

jest.mock('@/utils/debug/beatGridDebug', () => ({
  beatGridDebugLog: jest.fn(),
  beatGridDebugVerboseLog: jest.fn(),
  isBeatGridDebugEnabled: jest.fn(() => false),
}));

const chordsOnly = (chords: Array<{ start: number; end: number; chord: string }>) => ({
  chords: chords.map((c) => ({ ...c, time: c.start, confidence: 0.9 })),
  key: null,
  keyConfidence: null,
  decoding: null,
});

describe('audioAnalysisService meter candidate selection', () => {
  const makeFile = () => new File([new Uint8Array(1024)], 'meter.wav', { type: 'audio/wav' });
  const beats = Array.from({ length: 12 }, (_, index) => index);
  const candidates = {
    '3': [0, 3, 6, 9],
    '4': [0, 4, 8],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    (getAudioDurationFromFile as jest.Mock).mockResolvedValue(12);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selects 3/4 candidates when chord changes align with a three-beat meter', async () => {
    (detectBeatsWithRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      beats: [...beats],
      downbeats: [],
      downbeat_candidates: candidates,
      bpm: 120,
      time_signature: 4,
    });
    (recognizeChordsDetailed as jest.Mock).mockResolvedValue(chordsOnly([
      { start: 0, end: 2.8, chord: 'C' },
      { start: 3, end: 5.8, chord: 'F' },
      { start: 6, end: 8.8, chord: 'G' },
      { start: 9, end: 11.8, chord: 'C' },
    ]));

    const result = await analyzeAudioWithRateLimit(makeFile(), 'madmom', 'chord-cnn-lstm');

    expect(result.beatDetectionResult?.time_signature).toBe(3);
    expect(result.downbeats).toEqual(candidates['3']);
    expect(result.synchronizedChords).toHaveLength(beats.length);
  });

  it('selects 4/4 candidates when chord changes align with a four-beat meter', async () => {
    (detectBeatsWithRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      beats: [...beats],
      downbeats: [],
      downbeat_candidates: candidates,
      bpm: 120,
      time_signature: 3,
    });
    (recognizeChordsDetailed as jest.Mock).mockResolvedValue(chordsOnly([
      { start: 0, end: 3.8, chord: 'C' },
      { start: 4, end: 7.8, chord: 'Am' },
      { start: 8, end: 11.8, chord: 'F' },
    ]));

    const result = await analyzeAudioWithRateLimit(makeFile(), 'madmom', 'chord-cnn-lstm');

    expect(result.beatDetectionResult?.time_signature).toBe(4);
    expect(result.downbeats).toEqual(candidates['4']);
    expect(result.synchronizedChords.map((entry) => entry.beatIndex)).toEqual(beats.map((_, index) => index));
  });
});

describe('audioAnalysisService beat-synchronous chords', () => {
  const makeFile = () => new File([new Uint8Array(1024)], 'song.wav', { type: 'audio/wav' });
  // Fast tempo (0.3 s beats) so the frame-path downbeat snap would be active
  const beats = Array.from({ length: 16 }, (_, index) => index * 0.3);
  const downbeats = [0, 1.2, 2.4, 3.6];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getAudioDurationFromFile as jest.Mock).mockResolvedValue(5);
    (detectBeatsWithRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      beats: [...beats],
      downbeats: [...downbeats],
      bpm: 200,
      time_signature: 4,
      model: 'beat-this',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs beats first and sends the tracked beat grid with the chord request', async () => {
    (recognizeChordsDetailed as jest.Mock).mockResolvedValue({
      ...chordsOnly([{ start: 0, end: 1.5, chord: 'C' }, { start: 1.5, end: 4.8, chord: 'G' }]),
      key: 'C:major',
      keyConfidence: 0.2,
      decoding: 'beat-sync',
    });

    const result = await analyzeAudioWithRateLimit(makeFile(), 'beat-this', 'btc-cl');

    expect(detectBeatsWithRateLimit).toHaveBeenCalledTimes(1);
    expect(recognizeChordsDetailed).toHaveBeenCalledWith(expect.any(File), 'btc-cl', { beats, downbeats });
    expect(result.audioKey).toBe('C major');
    expect(result.audioKeyConfidence).toBe(0.2);
    expect(result.chordDecoding).toBe('beat-sync');
  });

  it('keeps beat-synchronous chord changes where the backend put them (no downbeat snap)', async () => {
    // G starts on beat 5, right after the downbeat at beat 4 (1.2 s); the frame-path snap
    // would pull it back onto beat 4.
    (recognizeChordsDetailed as jest.Mock).mockResolvedValue({
      ...chordsOnly([{ start: 0, end: 1.5, chord: 'C' }, { start: 1.5, end: 4.8, chord: 'G' }]),
      decoding: 'beat-sync',
    });

    const result = await analyzeAudioWithRateLimit(makeFile(), 'beat-this', 'btc-cl');
    const firstG = result.synchronizedChords.findIndex((entry) => entry.chord === 'G');
    expect(firstG).toBe(5);
  });

  it('retries without the beat grid when the request with beats fails', async () => {
    (recognizeChordsDetailed as jest.Mock)
      .mockRejectedValueOnce(new Error("Invalid detector 'btc-cl'"))
      .mockResolvedValueOnce(chordsOnly([{ start: 0, end: 4.8, chord: 'C' }]));

    const result = await analyzeAudioWithRateLimit(makeFile(), 'beat-this', 'btc-cl');

    expect(recognizeChordsDetailed).toHaveBeenCalledTimes(2);
    expect((recognizeChordsDetailed as jest.Mock).mock.calls[1][2]).toBeNull();
    expect(result.chords).toHaveLength(1);
    expect(result.audioKey).toBeNull();
  });
});

describe('buildChordBeatGrid', () => {
  it('sends downbeats only when the beat model tracked them', () => {
    expect(buildChordBeatGrid({ success: true, beats: [0, 0.5, 1], downbeats: [0] })).toEqual({
      beats: [0, 0.5, 1],
      downbeats: [0],
    });
    expect(buildChordBeatGrid({
      success: true,
      beats: [0, 0.5, 1],
      downbeats: [0],
      downbeat_candidates: { '3': [0], '4': [0] },
    })).toEqual({ beats: [0, 0.5, 1], downbeats: undefined });
  });

  it('returns null without at least two beats', () => {
    expect(buildChordBeatGrid({ success: true, beats: [0.5] })).toBeNull();
  });
});
