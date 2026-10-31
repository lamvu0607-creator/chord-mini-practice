'use client';

/**
 * A/B listening test for backing-track sound sources (soundfont kits, sampled pianos,
 * drum machines). Plays one progression with a simple groove so sources can be compared.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioContextManager } from '@/services/audio/audioContextManager';

type Part = 'drums' | 'bass' | 'piano' | 'guitar';

interface PlayableInstrument {
  start(sample: { note: string | number; time?: number; duration?: number | null; velocity?: number }): unknown;
  stop(sample?: unknown): void;
  disconnect?: () => void;
  output: { setVolume(volume: number): void };
  getGroupNames?: () => string[];
}

interface SourceOption {
  id: string;
  label: string;
  create: (ctx: AudioContext, destination: AudioNode) => Promise<PlayableInstrument>;
}

type Smplr = typeof import('smplr');

let smplrPromise: Promise<Smplr> | null = null;
const getSmplr = () => (smplrPromise ??= import('smplr'));

async function waitLoaded<T>(instrument: T): Promise<T> {
  const load = (instrument as unknown as { load?: Promise<unknown> | (() => Promise<unknown>) }).load;
  await (typeof load === 'function' ? load.call(instrument) : load);
  return instrument;
}

const soundfont = (instrument: string, kit: 'MusyngKite' | 'FluidR3_GM') => async (ctx: AudioContext, destination: AudioNode) => {
  const { Soundfont } = await getSmplr();
  return waitLoaded(new Soundfont(ctx, { instrument, kit, destination }) as unknown as PlayableInstrument);
};

const drumMachine = (instrument: string) => async (ctx: AudioContext, destination: AudioNode) => {
  const { DrumMachine } = await getSmplr();
  return waitLoaded(new DrumMachine(ctx, { instrument, destination }) as unknown as PlayableInstrument);
};

const SOURCES: Record<Part, SourceOption[]> = {
  drums: [
    { id: 'none', label: 'Off', create: async () => { throw new Error('none'); } },
    { id: 'dm:LM-2', label: 'LM-2 (drum machine 80s)', create: drumMachine('LM-2') },
    { id: 'dm:TR-808', label: 'TR-808', create: drumMachine('TR-808') },
    { id: 'dm:Casio-RZ1', label: 'Casio RZ-1', create: drumMachine('Casio-RZ1') },
    { id: 'dm:MFB-512', label: 'MFB-512', create: drumMachine('MFB-512') },
    { id: 'dm:Roland CR-8000', label: 'Roland CR-8000', create: drumMachine('Roland CR-8000') },
  ],
  bass: [
    { id: 'none', label: 'Off', create: async () => { throw new Error('none'); } },
    { id: 'mk:electric_bass_finger', label: 'Electric bass (MusyngKite)', create: soundfont('electric_bass_finger', 'MusyngKite') },
    { id: 'fl:electric_bass_finger', label: 'Electric bass (FluidR3)', create: soundfont('electric_bass_finger', 'FluidR3_GM') },
    { id: 'mk:acoustic_bass', label: 'Acoustic bass (MusyngKite)', create: soundfont('acoustic_bass', 'MusyngKite') },
    { id: 'fl:acoustic_bass', label: 'Acoustic bass (FluidR3)', create: soundfont('acoustic_bass', 'FluidR3_GM') },
  ],
  piano: [
    { id: 'none', label: 'Off', create: async () => { throw new Error('none'); } },
    { id: 'mk:acoustic_grand_piano', label: 'Grand piano (MusyngKite) — current', create: soundfont('acoustic_grand_piano', 'MusyngKite') },
    { id: 'fl:acoustic_grand_piano', label: 'Grand piano (FluidR3)', create: soundfont('acoustic_grand_piano', 'FluidR3_GM') },
    {
      id: 'splendid',
      label: 'Splendid Grand Piano (sampled, heavy)',
      create: async (ctx, destination) => {
        const { SplendidGrandPiano } = await getSmplr();
        return waitLoaded(new SplendidGrandPiano(ctx, { destination }) as unknown as PlayableInstrument);
      },
    },
    {
      id: 'ep:CP80',
      label: 'Yamaha CP80 (electric grand)',
      create: async (ctx, destination) => {
        const { ElectricPiano } = await getSmplr();
        return waitLoaded(new ElectricPiano(ctx, { instrument: 'CP80', destination }) as unknown as PlayableInstrument);
      },
    },
    {
      id: 'ep:WurlitzerEP200',
      label: 'Wurlitzer EP200',
      create: async (ctx, destination) => {
        const { ElectricPiano } = await getSmplr();
        return waitLoaded(new ElectricPiano(ctx, { instrument: 'WurlitzerEP200', destination }) as unknown as PlayableInstrument);
      },
    },
  ],
  guitar: [
    { id: 'none', label: 'Off', create: async () => { throw new Error('none'); } },
    { id: 'mk:acoustic_guitar_steel', label: 'Acoustic steel (MusyngKite) — current', create: soundfont('acoustic_guitar_steel', 'MusyngKite') },
    { id: 'fl:acoustic_guitar_steel', label: 'Acoustic steel (FluidR3)', create: soundfont('acoustic_guitar_steel', 'FluidR3_GM') },
    { id: 'mk:acoustic_guitar_nylon', label: 'Nylon (MusyngKite)', create: soundfont('acoustic_guitar_nylon', 'MusyngKite') },
    { id: 'mk:electric_guitar_clean', label: 'Electric clean (MusyngKite)', create: soundfont('electric_guitar_clean', 'MusyngKite') },
  ],
};

const DEFAULT_SELECTION: Record<Part, string> = {
  drums: 'dm:LM-2',
  bass: 'mk:electric_bass_finger',
  piano: 'mk:acoustic_grand_piano',
  guitar: 'none',
};

const PART_LABELS: Record<Part, string> = { drums: 'Drums', bass: 'Bass', piano: 'Piano / Keys', guitar: 'Guitar' };
const PARTS: Part[] = ['drums', 'bass', 'piano', 'guitar'];

const PROGRESSIONS: Record<string, string[]> = {
  'Pop: C – G – Am – F': ['C', 'G', 'Am', 'F'],
  'Ballad: C – Am – F – G': ['C', 'Am', 'F', 'G'],
  'Vpop: Am – F – C – G': ['Am', 'F', 'C', 'G'],
  'Jazz ii–V–I: Dm7 – G7 – Cmaj7 – Cmaj7': ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'],
};

// ---------- Harmony helpers ----------

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY_INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
};

function parseChord(symbol: string): { root: number; intervals: number[] } {
  const match = /^([A-G])([#b]?)(.*)$/.exec(symbol);
  if (!match) return { root: 0, intervals: QUALITY_INTERVALS[''] };
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return {
    root: (PITCH_CLASS[match[1]] + accidental + 12) % 12,
    intervals: QUALITY_INTERVALS[match[3]] ?? QUALITY_INTERVALS[''],
  };
}

/** Pick the inversion (within [low, high]) closest to the previous voicing for smooth voice leading. */
function voiceChord(symbol: string, previous: number[] | null, low: number, high: number): number[] {
  const { root, intervals } = parseChord(symbol);
  const pitchClasses = intervals.map((interval) => (root + interval) % 12);
  const candidates: number[][] = [];
  for (let base = low; base <= high; base++) {
    if (!pitchClasses.includes(base % 12)) continue;
    const startIndex = pitchClasses.indexOf(base % 12);
    const voicing = [base];
    for (let i = 1; i < pitchClasses.length; i++) {
      const pc = pitchClasses[(startIndex + i) % pitchClasses.length];
      let note = voicing[voicing.length - 1] + 1;
      while (note % 12 !== pc) note++;
      voicing.push(note);
    }
    if (voicing[voicing.length - 1] <= high) candidates.push(voicing);
  }
  if (!previous || candidates.length === 0) return candidates[Math.floor(candidates.length / 2)] ?? [60, 64, 67];
  const centre = (notes: number[]) => notes.reduce((sum, n) => sum + n, 0) / notes.length;
  const target = centre(previous);
  return candidates.reduce((best, voicing) =>
    Math.abs(centre(voicing) - target) < Math.abs(centre(best) - target) ? voicing : best);
}

// ---------- Groove (16 steps per bar) ----------

const KICK_STEPS = [0, 7, 8, 10];
const SNARE_STEPS = [4, 12];
const HAT_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];
const OPEN_HAT_STEPS = [14];
const BASS_STEPS: Array<{ step: number; degree: 'root' | 'fifth' | 'octave'; length: number }> = [
  { step: 0, degree: 'root', length: 3 },
  { step: 3, degree: 'root', length: 1 },
  { step: 6, degree: 'fifth', length: 2 },
  { step: 8, degree: 'root', length: 3 },
  { step: 11, degree: 'octave', length: 1 },
  { step: 14, degree: 'fifth', length: 2 },
];
const PIANO_STEPS: Array<{ step: number; length: number; velocity: number }> = [
  { step: 0, length: 6, velocity: 78 },
  { step: 6, length: 2, velocity: 62 },
  { step: 8, length: 6, velocity: 72 },
  { step: 14, length: 2, velocity: 60 },
];
const GUITAR_STRUMS: Array<{ step: number; down: boolean; velocity: number }> = [
  { step: 0, down: true, velocity: 84 },
  { step: 4, down: true, velocity: 70 },
  { step: 6, down: false, velocity: 56 },
  { step: 10, down: false, velocity: 58 },
  { step: 12, down: true, velocity: 72 },
  { step: 14, down: false, velocity: 56 },
];

function findDrumGroup(groups: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const found = groups.find((group) => pattern.test(group));
    if (found) return found;
  }
  return null;
}

// ---------- Mix bus (EQ, pan, reverb send, bus compression) ----------

const STRIP_SETTINGS: Record<Part, { pan: number; highpassHz: number; reverbSend: number; cut?: { hz: number; gainDb: number } }> = {
  drums: { pan: 0, highpassHz: 30, reverbSend: 0.12 },
  bass: { pan: 0, highpassHz: 35, reverbSend: 0.02, cut: { hz: 250, gainDb: -3 } },
  piano: { pan: 0.25, highpassHz: 110, reverbSend: 0.3, cut: { hz: 400, gainDb: -2 } },
  guitar: { pan: -0.35, highpassHz: 140, reverbSend: 0.25 },
};

interface MixBus {
  inputs: Record<Part, AudioNode>;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/** Synthetic room: stereo noise with exponential decay after a short pre-delay. */
function createImpulseResponse(ctx: AudioContext, seconds = 2.2, decay = 3): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const preDelay = Math.floor(ctx.sampleRate * 0.012);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = preDelay; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i - preDelay) / (length - preDelay), decay);
    }
  }
  return buffer;
}

/**
 * Each part gets a strip with two parallel paths: a raw path straight to the speakers and a mixed path
 * (high-pass, EQ cut, pan, reverb send, bus compressor). Toggling crossfades between them for A/B.
 */
function createMixBus(ctx: AudioContext, enabled: boolean): MixBus {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 8;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.18;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.1;
  compressor.connect(makeup).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = createImpulseResponse(ctx);
  const reverbTone = ctx.createBiquadFilter();
  reverbTone.type = 'highpass';
  reverbTone.frequency.value = 250;
  reverb.connect(reverbTone).connect(compressor);

  const rawGains: GainNode[] = [];
  const mixedGains: GainNode[] = [];
  const nodes: AudioNode[] = [compressor, makeup, reverb, reverbTone];
  const inputs = {} as Record<Part, AudioNode>;

  PARTS.forEach((part) => {
    const settings = STRIP_SETTINGS[part];
    const input = ctx.createGain();
    const raw = ctx.createGain();
    raw.gain.value = enabled ? 0 : 1;
    input.connect(raw).connect(ctx.destination);

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = settings.highpassHz;
    let last: AudioNode = input.connect(highpass);
    if (settings.cut) {
      const cut = ctx.createBiquadFilter();
      cut.type = 'peaking';
      cut.frequency.value = settings.cut.hz;
      cut.gain.value = settings.cut.gainDb;
      last = last.connect(cut);
      nodes.push(cut);
    }
    const panner = ctx.createStereoPanner();
    panner.pan.value = settings.pan;
    const mixed = ctx.createGain();
    mixed.gain.value = enabled ? 1 : 0;
    last.connect(panner).connect(mixed).connect(compressor);
    const send = ctx.createGain();
    send.gain.value = settings.reverbSend;
    mixed.connect(send).connect(reverb);

    inputs[part] = input;
    rawGains.push(raw);
    mixedGains.push(mixed);
    nodes.push(input, raw, highpass, panner, mixed, send);
  });

  return {
    inputs,
    setEnabled(on) {
      const now = ctx.currentTime;
      rawGains.forEach((gain) => gain.gain.setTargetAtTime(on ? 0 : 1, now, 0.02));
      mixedGains.forEach((gain) => gain.gain.setTargetAtTime(on ? 1 : 0, now, 0.02));
    },
    dispose() {
      nodes.forEach((node) => node.disconnect());
    },
  };
}

// ---------- Humanize helpers ----------

/** Random timing offset in seconds, uniformly within +/- ms. */
const jitter = (ms: number) => ((Math.random() * 2 - 1) * ms) / 1000;
const vary = (velocity: number, amount: number) =>
  Math.min(127, Math.max(1, Math.round(velocity + (Math.random() * 2 - 1) * amount)));

interface LoadState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  ms?: number;
  error?: string;
}

export default function SoundTestClient() {
  const [selection, setSelection] = useState<Record<Part, string>>(DEFAULT_SELECTION);
  const [volumes, setVolumes] = useState<Record<Part, number>>({ drums: 90, bass: 100, piano: 85, guitar: 80 });
  const [progressionName, setProgressionName] = useState(Object.keys(PROGRESSIONS)[0]);
  const [bpm, setBpm] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [currentBar, setCurrentBar] = useState(-1);
  const [loadStates, setLoadStates] = useState<Record<string, LoadState>>({});
  const [mixEnabled, setMixEnabled] = useState(true);
  const [humanize, setHumanize] = useState(true);
  const [swing, setSwing] = useState(56);

  const instrumentsRef = useRef(new Map<string, Promise<PlayableInstrument>>());
  const activeRef = useRef<Partial<Record<Part, PlayableInstrument>>>({});
  const settingsRef = useRef({ bpm, progression: PROGRESSIONS[progressionName], volumes, humanize, swing });
  const mixRef = useRef<MixBus | null>(null);
  const mixEnabledRef = useRef(mixEnabled);
  const schedulerRef = useRef<{ timer: ReturnType<typeof setInterval> | null; nextTime: number; step: number }>({
    timer: null,
    nextTime: 0,
    step: 0,
  });
  const voicingRef = useRef<{ piano: number[] | null; guitar: number[] | null }>({ piano: null, guitar: null });

  useEffect(() => {
    settingsRef.current = { bpm, progression: PROGRESSIONS[progressionName], volumes, humanize, swing };
  }, [bpm, progressionName, volumes, humanize, swing]);

  const getMix = useCallback(() => {
    mixRef.current ??= createMixBus(audioContextManager.getContext(), mixEnabledRef.current);
    return mixRef.current;
  }, []);

  useEffect(() => {
    mixEnabledRef.current = mixEnabled;
    mixRef.current?.setEnabled(mixEnabled);
  }, [mixEnabled]);

  const loadSource = useCallback(async (part: Part, id: string) => {
    if (id === 'none') {
      delete activeRef.current[part];
      return;
    }
    const option = SOURCES[part].find((source) => source.id === id);
    if (!option) return;
    let pending = instrumentsRef.current.get(id);
    if (!pending) {
      const ctx = audioContextManager.getContext();
      const startedAt = performance.now();
      setLoadStates((prev) => ({ ...prev, [id]: { status: 'loading' } }));
      pending = option.create(ctx, getMix().inputs[part]).then(
        (instrument) => {
          setLoadStates((prev) => ({ ...prev, [id]: { status: 'ready', ms: Math.round(performance.now() - startedAt) } }));
          return instrument;
        },
        (error: unknown) => {
          instrumentsRef.current.delete(id);
          setLoadStates((prev) => ({ ...prev, [id]: { status: 'error', error: String(error) } }));
          throw error;
        },
      );
      instrumentsRef.current.set(id, pending);
    }
    try {
      const instrument = await pending;
      instrument.output.setVolume(Math.round((settingsRef.current.volumes[part] / 100) * 127));
      activeRef.current[part] = instrument;
    } catch {
      delete activeRef.current[part];
    }
  }, [getMix]);

  useEffect(() => {
    PARTS.forEach((part) => {
      if (selection[part] === 'none') delete activeRef.current[part];
    });
  }, [selection]);

  useEffect(() => {
    PARTS.forEach((part) => activeRef.current[part]?.output.setVolume(Math.round((volumes[part] / 100) * 127)));
  }, [volumes]);

  const scheduleStep = useCallback((step: number, gridTime: number) => {
    const { bpm: tempo, progression, humanize: human, swing: swingPercent } = settingsRef.current;
    const sixteenth = 60 / tempo / 4;
    const barIndex = Math.floor(step / 16) % progression.length;
    const stepInBar = step % 16;
    const chord = progression[barIndex];
    const { root } = parseChord(chord);
    const nextRoot = parseChord(progression[(barIndex + 1) % progression.length]).root;
    const isLastBar = barIndex === progression.length - 1;
    const active = activeRef.current;
    // Swing pushes every off-beat 16th later; 50% is straight.
    const time = human && stepInBar % 2 === 1 ? gridTime + (swingPercent / 50 - 1) * sixteenth : gridTime;

    if (stepInBar === 0) {
      const delayMs = Math.max(0, (time - audioContextManager.getCurrentTime()) * 1000);
      setTimeout(() => setCurrentBar(barIndex), delayMs);
    }

    const drums = active.drums;
    if (drums?.getGroupNames) {
      const groups = drums.getGroupNames();
      const hit = (patterns: RegExp[], velocity: number, offset = 0) => {
        const group = findDrumGroup(groups, patterns);
        if (group) drums.start({ note: group, time: Math.max(gridTime, time + offset), velocity });
      };
      const kick = [/kick/i, /^bd/i, /bass ?drum/i];
      const snare = [/snare/i, /^sd/i, /clap/i];
      const openHat = [/open/i, /^oh/i, /hi-?hat/i, /hat/i];
      const closedHat = [/clos/i, /^ch/i, /hi-?hat/i, /hat/i];
      if (!human) {
        if (KICK_STEPS.includes(stepInBar)) hit(kick, stepInBar === 0 ? 118 : 100);
        if (SNARE_STEPS.includes(stepInBar)) hit(snare, 108);
        if (OPEN_HAT_STEPS.includes(stepInBar)) hit(openHat, 70);
        else if (HAT_STEPS.includes(stepInBar)) hit(closedHat, stepInBar % 4 === 0 ? 82 : 62);
      } else {
        // Snare fill closes each pass of the progression; a crash marks the start of the next one.
        const fill = isLastBar && stepInBar >= 13;
        if (barIndex === 0 && stepInBar === 0) hit([/crash/i, /cymbal/i, /^cy/i], vary(96, 6));
        if (KICK_STEPS.includes(stepInBar)) hit(kick, vary(stepInBar === 0 ? 116 : 98, 6), jitter(3));
        if (SNARE_STEPS.includes(stepInBar)) hit(snare, vary(106, 5), 0.004 + jitter(3));
        else if (fill) hit(snare, vary(58 + (stepInBar - 13) * 16, 4), jitter(4));
        else if ((stepInBar === 7 || stepInBar === 15) && Math.random() < 0.3) hit(snare, vary(28, 6), jitter(4));
        if (!fill) {
          if (OPEN_HAT_STEPS.includes(stepInBar)) hit(openHat, vary(68, 6), jitter(5));
          else if (HAT_STEPS.includes(stepInBar)) hit(closedHat, vary(stepInBar % 4 === 0 ? 86 : 60, 8), jitter(5));
          else if (Math.random() < 0.35) hit(closedHat, vary(34, 8), jitter(5));
        }
      }
    }

    const bass = active.bass;
    const bassHit = BASS_STEPS.find((entry) => entry.step === stepInBar);
    if (bass && bassHit) {
      const offset = bassHit.degree === 'root' ? 0 : bassHit.degree === 'fifth' ? 7 : 12;
      let note = 36 + root + offset;
      if (human && stepInBar === 14 && nextRoot !== root && Math.random() < 0.5) {
        // Chromatic approach into the next bar's root.
        note = 36 + nextRoot + (Math.random() < 0.5 ? -1 : 1);
      }
      bass.start(human
        ? {
          note,
          time: time + jitter(5),
          duration: bassHit.length * sixteenth * (0.78 + Math.random() * 0.15),
          velocity: vary(stepInBar % 8 === 0 ? 104 : 90, 8),
        }
        : { note, time, duration: bassHit.length * sixteenth * 0.92, velocity: 100 });
    }

    const piano = active.piano;
    const pianoHit = PIANO_STEPS.find((entry) => entry.step === stepInBar);
    if (piano && pianoHit) {
      if (stepInBar === 0 || !voicingRef.current.piano) {
        voicingRef.current.piano = voiceChord(chord, voicingRef.current.piano, 55, 74);
      }
      const voicing = voicingRef.current.piano;
      const start = time + (human ? jitter(6) : 0);
      voicing.forEach((note, index) => {
        if (!human) {
          piano.start({ note, time, duration: pianoHit.length * sixteenth * 0.95, velocity: pianoHit.velocity });
          return;
        }
        // Slight roll from the bottom up; the top voice sings a little louder.
        const isTop = index === voicing.length - 1;
        piano.start({
          note,
          time: start + index * (0.003 + Math.random() * 0.004),
          duration: pianoHit.length * sixteenth * (0.85 + Math.random() * 0.1),
          velocity: vary(pianoHit.velocity + (isTop ? 6 : -2), 5),
        });
      });
    }

    const guitar = active.guitar;
    const strum = GUITAR_STRUMS.find((entry) => entry.step === stepInBar);
    if (guitar && strum) {
      if (stepInBar === 0 || !voicingRef.current.guitar) {
        const triad = voiceChord(chord, voicingRef.current.guitar, 52, 67);
        voicingRef.current.guitar = [36 + 12 + root, ...triad].sort((a, b) => a - b);
      }
      const voicing = voicingRef.current.guitar;
      if (!human) {
        const strings = strum.down ? voicing : [...voicing].reverse();
        strings.forEach((note, index) =>
          guitar.start({ note, time: time + index * 0.012, duration: sixteenth * 1.8, velocity: strum.velocity - index * 2 }));
      } else {
        // Down-strokes sweep every string slower and harder; up-strokes catch only the top strings.
        const strings = strum.down ? voicing : [...voicing].reverse().slice(0, 3);
        const spread = strum.down ? 0.011 + Math.random() * 0.006 : 0.006 + Math.random() * 0.003;
        const start = time + jitter(6);
        strings.forEach((note, index) =>
          guitar.start({
            note,
            time: start + index * spread,
            duration: sixteenth * (1.5 + Math.random() * 0.5),
            velocity: vary(strum.velocity - index * 3, 5),
          }));
      }
    }
  }, []);

  const stop = useCallback(() => {
    const scheduler = schedulerRef.current;
    if (scheduler.timer) clearInterval(scheduler.timer);
    scheduler.timer = null;
    Object.values(activeRef.current).forEach((instrument) => instrument?.stop());
    voicingRef.current = { piano: null, guitar: null };
    setPlaying(false);
    setCurrentBar(-1);
  }, []);

  const play = useCallback(async () => {
    await audioContextManager.resume();
    await Promise.all(PARTS.map((part) => loadSource(part, selection[part])));
    const scheduler = schedulerRef.current;
    scheduler.step = 0;
    scheduler.nextTime = audioContextManager.getCurrentTime() + 0.15;
    const lookahead = 0.12;
    scheduler.timer = setInterval(() => {
      const now = audioContextManager.getCurrentTime();
      while (scheduler.nextTime < now + lookahead) {
        scheduleStep(scheduler.step, scheduler.nextTime);
        scheduler.nextTime += 60 / settingsRef.current.bpm / 4;
        scheduler.step += 1;
      }
    }, 25);
    setPlaying(true);
  }, [loadSource, scheduleStep, selection]);

  const changeSource = (part: Part, id: string) => {
    setSelection((prev) => ({ ...prev, [part]: id }));
    activeRef.current[part]?.stop();
    void loadSource(part, id);
  };

  useEffect(() => () => {
    const scheduler = schedulerRef.current;
    if (scheduler.timer) clearInterval(scheduler.timer);
    const instruments = instrumentsRef.current;
    instruments.forEach((pending) => {
      pending.then((instrument) => { instrument.stop(); instrument.disconnect?.(); }).catch(() => undefined);
    });
    instruments.clear();
    mixRef.current?.dispose();
    mixRef.current = null;
  }, []);

  const progression = PROGRESSIONS[progressionName];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-gray-900 dark:text-gray-100">
      <h1 className="text-2xl font-semibold">Sound test</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Compare sound sets for the accompaniment. Switch sources while playing to A/B them; the first time you pick a source its samples are downloaded.
      </p>

      <section className="mt-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <button
          type="button"
          onClick={playing ? stop : play}
          className="rounded-md bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700"
        >
          {playing ? 'Stop' : 'Play'}
        </button>
        <label className="flex flex-col text-sm">
          Chord loop
          <select
            value={progressionName}
            onChange={(event) => { setProgressionName(event.target.value); voicingRef.current = { piano: null, guitar: null }; }}
            className="mt-1 rounded-md border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          >
            {Object.keys(PROGRESSIONS).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Tempo: {bpm} BPM
          <input type="range" min={60} max={160} value={bpm} onChange={(event) => setBpm(Number(event.target.value))} className="mt-2 w-40" />
        </label>
      </section>

      <section className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={mixEnabled} onChange={(event) => setMixEnabled(event.target.checked)} />
          Mix (reverb, compressor, stereo pan, EQ)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={humanize} onChange={(event) => setHumanize(event.target.checked)} />
          Humanize (velocity, timing drift, ghost notes, fills)
        </label>
        <label className={`flex items-center gap-2 ${humanize ? '' : 'opacity-50'}`}>
          Swing {swing}%
          <input type="range" min={50} max={66} value={swing} disabled={!humanize} onChange={(event) => setSwing(Number(event.target.value))} className="w-32" />
        </label>
      </section>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {progression.map((chord, index) => (
          <div
            key={`${chord}-${index}`}
            className={`rounded-md border px-2 py-3 text-center font-mono text-lg ${
              index === currentBar
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            {chord}
          </div>
        ))}
      </div>

      <section className="mt-6 space-y-4">
        {PARTS.map((part) => {
          const state = loadStates[selection[part]];
          return (
            <div key={part} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-28 font-medium">{PART_LABELS[part]}</span>
                <select
                  value={selection[part]}
                  onChange={(event) => changeSource(part, event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                >
                  {SOURCES[part].map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
                </select>
                <span className="w-28 text-right text-xs text-gray-500 dark:text-gray-400">
                  {selection[part] === 'none' ? '' :
                    state?.status === 'loading' ? 'Loading…' :
                    state?.status === 'ready' ? `Loaded in ${(state.ms! / 1000).toFixed(1)}s` :
                    state?.status === 'error' ? 'Load error' : 'Not loaded'}
                </span>
              </div>
              <label className="mt-3 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                Volume
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volumes[part]}
                  onChange={(event) => setVolumes((prev) => ({ ...prev, [part]: Number(event.target.value) }))}
                  className="flex-1"
                />
                <span className="w-8 text-right">{volumes[part]}</span>
              </label>
            </div>
          );
        })}
      </section>

      <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
        Sample sources: MusyngKite/FluidR3 soundfonts (gleitz), drum machines and electric pianos from the smplr library, loaded directly from GitHub Pages.
        No acoustic drums yet — that needs a self-hosted .sf2 soundfont.
      </p>
    </main>
  );
}
