import { parseYouTubeVideoId } from '@/services/stems/stemsApi';

const fakeContext = {
  currentTime: 0,
  state: 'running',
  resume: jest.fn(async () => undefined),
  close: jest.fn(async () => undefined),
  destination: {},
  createGain: () => ({
    gain: { value: 1, setTargetAtTime(value: number) { this.value = value; } },
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
  createBufferSource: () => ({ buffer: null, connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn() }),
  decodeAudioData: jest.fn(async () => ({
    duration: 10, length: 441000, sampleRate: 44100, numberOfChannels: 1,
    getChannelData: () => new Float32Array(441000).fill(0.5),
  })),
};

(window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => fakeContext);

describe('parseYouTubeVideoId', () => {
  it.each([
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ['youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('reads %s', (input, expected) => {
    expect(parseYouTubeVideoId(input)).toBe(expected);
  });

  it.each(['', 'not a link', 'https://vimeo.com/123', 'https://www.youtube.com/watch?v=short', 'https://evil.com/watch?v=dQw4w9WgXcQ'])(
    'rejects %s',
    (input) => expect(parseYouTubeVideoId(input)).toBeNull(),
  );
});

describe('StemMixerEngine', () => {
  beforeEach(() => {
    fakeContext.currentTime = 0;
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch;
  });

  async function loadedEngine() {
    const { StemMixerEngine } = await import('@/services/stems/stemMixerEngine');
    const engine = new StemMixerEngine();
    await engine.load([{ name: 'vocals', url: '/v' }, { name: 'drums', url: '/d' }]);
    return engine;
  }

  it('applies mute and solo rules to effective gain', async () => {
    const { StemMixerEngine } = await import('@/services/stems/stemMixerEngine');
    const base = { name: 'x', volume: 0.8, muted: false, soloed: false };
    expect(StemMixerEngine.effectiveGain(base, false)).toBe(0.8);
    expect(StemMixerEngine.effectiveGain({ ...base, muted: true }, false)).toBe(0);
    expect(StemMixerEngine.effectiveGain(base, true)).toBe(0);
    expect(StemMixerEngine.effectiveGain({ ...base, soloed: true }, true)).toBe(0.8);
    expect(StemMixerEngine.effectiveGain({ ...base, soloed: true, muted: true }, true)).toBe(0);
  });

  it('starts every stem at the same audio-clock time and tracks position', async () => {
    const engine = await loadedEngine();
    expect(engine.duration).toBe(10);
    await engine.play();
    expect(engine.isPlaying).toBe(true);
    fakeContext.currentTime = 3.05;
    expect(engine.getCurrentTime()).toBeCloseTo(3, 5);
    engine.pause();
    expect(engine.getCurrentTime()).toBeCloseTo(3, 5);
    engine.seek(7.5);
    expect(engine.getCurrentTime()).toBe(7.5);
    engine.seek(99);
    expect(engine.getCurrentTime()).toBe(10);
    engine.dispose();
  });

  it('reports mute/solo changes through track state and listeners', async () => {
    const engine = await loadedEngine();
    const listener = jest.fn();
    engine.subscribe(listener);
    engine.setSoloed('vocals', true);
    engine.setVolume('drums', 3);
    expect(engine.trackStates).toEqual([
      { name: 'vocals', volume: 1, muted: false, soloed: true },
      { name: 'drums', volume: 1.5, muted: false, soloed: false },
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(engine.getPeaks('vocals', 4)).toHaveLength(8);
    engine.dispose();
  });
});

describe('positionAt', () => {
  it('advances by tempo and wraps inside an A-B loop', async () => {
    const { positionAt } = await import('@/services/stems/stemMixerEngine');
    expect(positionAt(10, 4, 1, null)).toBe(14);
    expect(positionAt(10, 4, 0.5, null)).toBe(12);
    const loop = { start: 20, end: 30 };
    expect(positionAt(25, 3, 1, loop)).toBe(28);
    expect(positionAt(25, 7, 1, loop)).toBe(22);
    expect(positionAt(25, 27, 1, loop)).toBe(22);
    expect(positionAt(5, 30, 1, loop)).toBe(25);
    // Started after the loop end: plays straight on, like an AudioBufferSourceNode would.
    expect(positionAt(35, 2, 1, loop)).toBe(37);
  });
});

describe('StemMixerEngine practice controls', () => {
  const grainPlayers: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    fakeContext.currentTime = 0;
    grainPlayers.length = 0;
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch;
    jest.doMock('tone', () => ({
      Context: jest.fn(() => ({ dispose: jest.fn() })),
      ToneAudioBuffer: jest.fn(() => ({ dispose: jest.fn() })),
      GrainPlayer: jest.fn((options: Record<string, unknown>) => {
        const player = { ...options, connect: jest.fn(), start: jest.fn(), stop: jest.fn(), dispose: jest.fn() };
        grainPlayers.push(player);
        return player;
      }),
    }), { virtual: false });
  });

  async function loadedEngine() {
    const { StemMixerEngine } = await import('@/services/stems/stemMixerEngine');
    const engine = new StemMixerEngine();
    await engine.load([{ name: 'vocals', url: '/v' }, { name: 'drums', url: '/d' }]);
    return engine;
  }

  it('validates loop regions and jumps into the loop when playback starts outside it', async () => {
    const created: Array<Record<string, unknown>> = [];
    const original = fakeContext.createBufferSource;
    fakeContext.createBufferSource = () => {
      const source = original();
      created.push(source as unknown as Record<string, unknown>);
      return source;
    };
    const engine = await loadedEngine();

    engine.setLoop({ start: 4, end: 4.1 });
    expect(engine.practiceState.loop).toBeNull();
    engine.setLoop({ start: 6, end: 2 });
    expect(engine.practiceState).toMatchObject({ loop: { start: 2, end: 6 }, loopEnabled: true });

    await engine.play();
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ loop: true, loopStart: 2, loopEnd: 6 });
    fakeContext.currentTime = 0.05 + 5;
    expect(engine.getCurrentTime()).toBeCloseTo(3, 5);

    engine.setLoopEnabled(false);
    expect(engine.practiceState.loopEnabled).toBe(false);
    engine.setLoop(null);
    expect(engine.practiceState).toMatchObject({ loop: null, loopEnabled: false });
    fakeContext.createBufferSource = original;
    engine.dispose();
  });

  it('switches to grain players for tempo/pitch and retunes pitch in place', async () => {
    const engine = await loadedEngine();
    engine.setRate(0.8);
    engine.setSemitones(-2);
    await engine.play();
    expect(grainPlayers).toHaveLength(2);
    expect(grainPlayers[0]).toMatchObject({ playbackRate: 0.8, detune: -200, grainSize: 0.2, overlap: 0.1 });

    fakeContext.currentTime = 0.1 + 10;
    expect(engine.getCurrentTime()).toBeCloseTo(8, 5);

    engine.setSemitones(3);
    expect(grainPlayers).toHaveLength(2);
    expect(grainPlayers[0].detune).toBe(300);

    engine.setRate(9);
    expect(engine.practiceState.rate).toBe(2);
    engine.setSemitones(-40);
    expect(engine.practiceState.semitones).toBe(-12);
    engine.dispose();
  });
});
