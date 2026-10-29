import { audioBufferToWav } from '@/utils/audioBufferUtils';

type ToneModule = typeof import('tone');
type GrainPlayer = InstanceType<ToneModule['GrainPlayer']>;
type ToneContext = InstanceType<ToneModule['Context']>;
type ToneBuffer = InstanceType<ToneModule['ToneAudioBuffer']>;

export interface StemSource {
  name: string;
  url: string;
}

export interface StemTrackState {
  name: string;
  volume: number;
  muted: boolean;
  soloed: boolean;
}

export interface LoopRegion {
  start: number;
  end: number;
}

export interface PracticeState {
  /** Playback speed multiplier (tempo), independent of pitch. */
  rate: number;
  /** Pitch shift in semitones, independent of tempo. */
  semitones: number;
  loop: LoopRegion | null;
  loopEnabled: boolean;
}

interface Track extends StemTrackState {
  buffer: AudioBuffer;
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  grain: GrainPlayer | null;
  toneBuffer: ToneBuffer | null;
}

type Listener = () => void;

/** Slight scheduling lead so every stem starts on the same audio-clock tick. */
const START_LEAD_SECONDS = 0.05;
/** GrainPlayers schedule grains through Tone's ticker, so they need a little more lead. */
const GRAIN_START_LEAD_SECONDS = 0.1;
const GAIN_SMOOTHING_SECONDS = 0.015;
/** Same grain settings as grainPlayerPitchShiftService (200 ms grains, 50% crossfade). */
const GRAIN_SIZE = 0.2;
const GRAIN_OVERLAP = 0.1;

/** Covers every YouTube playback rate (0.25x..2x) so the engine can follow the video. */
export const MIN_RATE = 0.25;
export const MAX_RATE = 2;
export const MAX_SEMITONES = 12;
const MIN_LOOP_SECONDS = 0.25;

/**
 * Song position for a source started at `offset`, `elapsed` audio-clock seconds ago, at `rate`.
 * With a loop, playback that crosses the loop end wraps back to the loop start.
 */
/** A dedicated AudioContext for stem playback (never the app-wide shared one). */
export function createStemAudioContext(latencyHint: AudioContextLatencyCategory = 'playback'): AudioContext {
  const Ctor = window.AudioContext
    || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor({ latencyHint });
}

export function positionAt(offset: number, elapsed: number, rate: number, loop: LoopRegion | null): number {
  const raw = offset + Math.max(0, elapsed) * rate;
  if (!loop || offset >= loop.end || raw < loop.end) return raw;
  const length = loop.end - loop.start;
  return loop.start + ((raw - loop.start) % length);
}

/**
 * Plays several stems of one song in sync with per-stem volume / mute / solo,
 * A-B looping, and independent tempo / pitch. All sources start at the same
 * AudioContext time, so they cannot drift apart.
 *
 * At normal speed and pitch it plays the decoded buffers directly (cleanest
 * sound). Changing tempo or pitch switches every stem to a Tone.js
 * GrainPlayer bound to this engine's private context.
 */
export class StemMixerEngine {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private tracks: Track[] = [];
  private playing = false;
  private startContextTime = 0;
  private startOffset = 0;
  private pausedAt = 0;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  private disposed = false;
  private tone: ToneModule | null = null;
  private toneContext: ToneContext | null = null;
  private practice: PracticeState = { rate: 1, semitones: 0, loop: null, loopEnabled: false };
  /** Rate/loop the currently running sources were started with (the clock must use these). */
  private runningRate = 1;
  private runningLoop: LoopRegion | null = null;
  private runningGrain = false;

  duration = 0;

  /**
   * @param context Optional AudioContext the engine takes ownership of (closed on dispose).
   *   Pass one created and resumed inside a click handler when playback will later be started
   *   without a user gesture (e.g. following a cross-origin YouTube iframe).
   */
  constructor(context?: AudioContext) {
    // A private context: the shared audioContextManager may close and replace its context on
    // resume, which would silently orphan every buffer source this engine has scheduled.
    this.context = context ?? createStemAudioContext('playback');
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
  }

  /** Fetch and decode every stem; `onProgress` receives 0..1 as stems finish. */
  async load(stems: StemSource[], onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
    let done = 0;
    const decoded = await Promise.all(stems.map(async (stem) => {
      const response = await fetch(stem.url, { signal });
      if (!response.ok) throw new Error(`Failed to load ${stem.name} (${response.status})`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      done += 1;
      onProgress?.(done / stems.length);
      return { stem, buffer };
    }));
    if (this.disposed) return;

    this.tracks = decoded.map(({ stem, buffer }) => {
      const gain = this.context.createGain();
      gain.connect(this.master);
      return {
        name: stem.name, buffer, gain, source: null, grain: null, toneBuffer: null,
        volume: 1, muted: false, soloed: false,
      };
    });
    this.duration = Math.max(0, ...this.tracks.map((track) => track.buffer.duration));
    this.applyGains(true);
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get trackStates(): StemTrackState[] {
    return this.tracks.map(({ name, volume, muted, soloed }) => ({ name, volume, muted, soloed }));
  }

  get practiceState(): PracticeState {
    return { ...this.practice, loop: this.practice.loop ? { ...this.practice.loop } : null };
  }

  private get activeLoop(): LoopRegion | null {
    return this.practice.loopEnabled ? this.practice.loop : null;
  }

  private get needsGrain(): boolean {
    return this.practice.rate !== 1 || this.practice.semitones !== 0;
  }

  /** Seconds between scheduling a sample and hearing it (output + base latency). */
  get outputLatencySeconds(): number {
    const context = this.context as AudioContext & { outputLatency?: number; baseLatency?: number };
    return (context.outputLatency || 0) + (context.baseLatency || 0);
  }

  getCurrentTime(): number {
    if (!this.playing) return this.pausedAt;
    const elapsed = this.context.currentTime - this.startContextTime;
    return Math.min(this.duration, positionAt(this.startOffset, elapsed, this.runningRate, this.runningLoop));
  }

  async play(): Promise<void> {
    if (this.playing || this.tracks.length === 0) return;
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio playback is blocked by the browser. Click play again.');

    const loop = this.activeLoop;
    let offset = this.pausedAt >= this.duration ? 0 : this.pausedAt;
    if (loop && (offset < loop.start || offset >= loop.end)) offset = loop.start;

    const useGrain = this.needsGrain;
    if (useGrain) await this.ensureTone();
    if (this.disposed || this.playing) return;

    const when = this.context.currentTime + (useGrain ? GRAIN_START_LEAD_SECONDS : START_LEAD_SECONDS);
    for (const track of this.tracks) {
      if (useGrain) this.startGrain(track, when, offset, loop);
      else this.startBuffer(track, when, offset, loop);
    }

    this.playing = true;
    this.startContextTime = when;
    this.startOffset = offset;
    this.runningRate = useGrain ? this.practice.rate : 1;
    this.runningLoop = loop;
    this.runningGrain = useGrain;
    if (!loop) this.scheduleEnd(when);
    this.emit();
  }

  /**
   * Line playback up with an external clock that reads `position` right now at `rate`:
   * starts slightly ahead to absorb the scheduling lead and output latency, so the audible
   * sound matches the external position. Used to follow the YouTube master clock.
   */
  followTo(position: number, rate: number): Promise<void> {
    this.practice.rate = Math.round(Math.max(MIN_RATE, Math.min(MAX_RATE, rate)) * 100) / 100;
    const lead = (this.needsGrain ? GRAIN_START_LEAD_SECONDS : START_LEAD_SECONDS) + this.outputLatencySeconds;
    if (this.playing) {
      this.stopSources();
      this.playing = false;
    }
    this.pausedAt = Math.max(0, Math.min(this.duration, position + lead * this.practice.rate));
    return this.play();
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedAt = this.getCurrentTime();
    this.stopSources();
    this.playing = false;
    this.emit();
  }

  toggle(): Promise<void> | void {
    return this.playing ? this.pause() : this.play();
  }

  seek(seconds: number): void {
    this.pausedAt = Math.max(0, Math.min(this.duration, seconds));
    this.restartIfPlaying();
  }

  setVolume(name: string, volume: number): void {
    this.updateTrack(name, (track) => { track.volume = Math.max(0, Math.min(1.5, volume)); });
  }

  setMuted(name: string, muted: boolean): void {
    this.updateTrack(name, (track) => { track.muted = muted; });
  }

  setSoloed(name: string, soloed: boolean): void {
    this.updateTrack(name, (track) => { track.soloed = soloed; });
  }

  setMasterVolume(volume: number): void {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1.5, volume)), this.context.currentTime, GAIN_SMOOTHING_SECONDS);
  }

  /** Tempo multiplier, clamped to 0.5x..1.5x. */
  setRate(rate: number): void {
    const next = Math.round(Math.max(MIN_RATE, Math.min(MAX_RATE, rate)) * 100) / 100;
    if (next === this.practice.rate) return;
    this.practice.rate = next;
    this.restartIfPlaying();
  }

  /** Pitch shift in whole semitones, clamped to ±12. */
  setSemitones(semitones: number): void {
    const next = Math.round(Math.max(-MAX_SEMITONES, Math.min(MAX_SEMITONES, semitones)));
    if (next === this.practice.semitones) return;
    this.practice.semitones = next;
    // Pitch alone does not move the playhead, so running grain players can be retuned in place.
    if (this.playing && this.runningGrain && this.needsGrain) {
      for (const track of this.tracks) {
        if (track.grain) track.grain.detune = next * 100;
      }
      this.emit();
      return;
    }
    this.restartIfPlaying();
  }

  /** Set (or clear with null) the A-B region; setting a region also enables looping. */
  setLoop(region: LoopRegion | null): void {
    if (region) {
      const start = Math.max(0, Math.min(region.start, region.end));
      const end = Math.min(this.duration, Math.max(region.start, region.end));
      if (end - start < MIN_LOOP_SECONDS) return;
      this.practice.loop = { start, end };
      this.practice.loopEnabled = true;
    } else {
      this.practice.loop = null;
      this.practice.loopEnabled = false;
    }
    this.restartIfPlaying();
  }

  setLoopEnabled(enabled: boolean): void {
    const next = enabled && Boolean(this.practice.loop);
    if (next === this.practice.loopEnabled) return;
    this.practice.loopEnabled = next;
    this.restartIfPlaying();
  }

  /** Effective gain after mute/solo rules: any solo silences every non-soloed stem. */
  static effectiveGain(track: StemTrackState, anySolo: boolean): number {
    if (track.muted) return 0;
    if (anySolo && !track.soloed) return 0;
    return track.volume;
  }

  /** Min/max peaks per bucket (mono mix of channels) for drawing a waveform. */
  getPeaks(name: string, buckets: number): Float32Array {
    const track = this.tracks.find((entry) => entry.name === name);
    const peaks = new Float32Array(buckets * 2);
    if (!track || buckets <= 0) return peaks;
    const channels = Array.from({ length: track.buffer.numberOfChannels }, (_, index) => track.buffer.getChannelData(index));
    const samplesPerBucket = Math.max(1, Math.floor(track.buffer.length / buckets));
    for (let bucket = 0; bucket < buckets; bucket += 1) {
      let min = 0;
      let max = 0;
      const start = bucket * samplesPerBucket;
      const end = Math.min(track.buffer.length, start + samplesPerBucket);
      // Stride keeps this fast for long songs; peaks only need to look right.
      const stride = Math.max(1, Math.floor((end - start) / 256));
      for (let index = start; index < end; index += stride) {
        let value = 0;
        for (const channel of channels) value += channel[index];
        value /= channels.length;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      peaks[bucket * 2] = min;
      peaks[bucket * 2 + 1] = max;
    }
    return peaks;
  }

  /**
   * Render a mix offline (original tempo and pitch) and encode it as 16-bit WAV.
   * `gains` maps stem name to gain; stems not listed use their current effective gain.
   */
  async renderMix(gains?: Record<string, number>): Promise<Blob> {
    if (this.tracks.length === 0) throw new Error('No stems loaded');
    const sampleRate = this.tracks[0].buffer.sampleRate;
    const channels = Math.max(...this.tracks.map((track) => track.buffer.numberOfChannels));
    const length = Math.max(...this.tracks.map((track) => track.buffer.length));
    const offline = new OfflineAudioContext(channels, length, sampleRate);
    const anySolo = this.tracks.some((track) => track.soloed);

    for (const track of this.tracks) {
      const gainValue = gains?.[track.name] ?? StemMixerEngine.effectiveGain(track, anySolo);
      if (gainValue <= 0) continue;
      const source = offline.createBufferSource();
      source.buffer = track.buffer;
      const gain = offline.createGain();
      gain.gain.value = gainValue;
      source.connect(gain).connect(offline.destination);
      source.start(0);
    }

    return audioBufferToWav(await offline.startRendering());
  }

  dispose(): void {
    this.disposed = true;
    this.stopSources();
    this.playing = false;
    for (const track of this.tracks) {
      track.gain.disconnect();
      track.toneBuffer?.dispose();
    }
    this.master.disconnect();
    this.tracks = [];
    this.listeners.clear();
    if (this.toneContext) {
      // Tone's Context.dispose stops its ticker and closes the wrapped AudioContext.
      this.toneContext.dispose();
    } else {
      void this.context.close().catch(() => undefined);
    }
  }

  private async ensureTone(): Promise<void> {
    if (this.toneContext) return;
    this.tone = this.tone ?? await import('tone');
    // Wrap our own context instead of touching Tone's global one, which other pages rely on.
    this.toneContext = new this.tone.Context(this.context);
  }

  private startBuffer(track: Track, when: number, offset: number, loop: LoopRegion | null): void {
    const source = this.context.createBufferSource();
    source.buffer = track.buffer;
    if (loop) {
      source.loop = true;
      source.loopStart = loop.start;
      source.loopEnd = loop.end;
    }
    source.connect(track.gain);
    source.start(when, Math.min(offset, track.buffer.duration));
    track.source = source;
  }

  private startGrain(track: Track, when: number, offset: number, loop: LoopRegion | null): void {
    const Tone = this.tone!;
    track.toneBuffer = track.toneBuffer ?? new Tone.ToneAudioBuffer(track.buffer);
    const player = new Tone.GrainPlayer({
      context: this.toneContext!,
      url: track.toneBuffer,
      grainSize: GRAIN_SIZE,
      overlap: GRAIN_OVERLAP,
      playbackRate: this.practice.rate,
      detune: this.practice.semitones * 100,
      loop: Boolean(loop),
      loopStart: loop?.start ?? 0,
      loopEnd: loop?.end ?? 0,
    });
    player.connect(track.gain);
    player.start(when, Math.min(offset, track.buffer.duration));
    track.grain = player;
  }

  private restartIfPlaying(): void {
    if (!this.playing) {
      this.emit();
      return;
    }
    this.pausedAt = this.getCurrentTime();
    this.stopSources();
    this.playing = false;
    this.play().catch(() => this.emit());
  }

  private updateTrack(name: string, update: (track: Track) => void): void {
    const track = this.tracks.find((entry) => entry.name === name);
    if (!track) return;
    update(track);
    this.applyGains();
    this.emit();
  }

  private applyGains(immediate = false): void {
    const anySolo = this.tracks.some((track) => track.soloed);
    for (const track of this.tracks) {
      const value = StemMixerEngine.effectiveGain(track, anySolo);
      if (immediate) {
        track.gain.gain.value = value;
      } else {
        track.gain.gain.setTargetAtTime(value, this.context.currentTime, GAIN_SMOOTHING_SECONDS);
      }
    }
  }

  private stopSources(): void {
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    for (const track of this.tracks) {
      if (track.source) {
        try {
          track.source.stop();
        } catch {
          // Already stopped
        }
        track.source.disconnect();
        track.source = null;
      }
      if (track.grain) {
        try {
          track.grain.stop();
        } catch {
          // Already stopped
        }
        track.grain.dispose();
        track.grain = null;
      }
    }
  }

  private scheduleEnd(when: number): void {
    const remaining = (this.duration - this.startOffset) / this.runningRate + (when - this.context.currentTime);
    this.endTimer = setTimeout(() => {
      if (!this.playing) return;
      this.stopSources();
      this.playing = false;
      this.pausedAt = this.duration;
      this.emit();
    }, Math.max(0, remaining * 1000));
  }
}
