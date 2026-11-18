'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Chip, Tabs, Tab, Tooltip } from '@heroui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import HeroPianoVisualizerMock from '@/components/homepage/HeroPianoVisualizerMock';
import { getStemColor } from '@/components/stems/stemColors';

// ============================================================
// Mock Data
// ============================================================

const MEASURES: string[][] = [
  ['C', 'C', 'C', 'C'],
  ['Am', 'Am', 'Am', 'Am'],
  ['F', 'F', 'F', 'F'],
  ['G', 'G', 'G', 'G'],
  ['C', 'C', 'C', 'C'],
  ['Em', 'Em', 'Am', 'Am'],
  ['F', 'F', 'G', 'G'],
  ['C', 'C', 'C', 'C'],
  ['Dm', 'Dm', 'Dm', 'Dm'],
  ['G', 'G', 'G7', 'G7'],
  ['Am', 'Am', 'F', 'F'],
  ['G', 'G', 'C', ''],
];

const ROMAN: Record<string, string> = {
  C: 'I', Am: 'vi', F: 'IV', G: 'V', Dm: 'ii', Em: 'iii', G7: 'V⁷',
};

const TOTAL_BEATS = MEASURES.reduce((s, m) => s + m.length, 0);
const BEAT_INTERVAL_MS = 800;

// Flat chord list for quick lookup
const FLAT_CHORDS: string[] = MEASURES.flat();

// Unique chord progression (consecutive duplicates collapsed)
interface ProgressionEntry { chord: string; startBeat: number }
const UNIQUE_PROGRESSION: ProgressionEntry[] = (() => {
  const result: ProgressionEntry[] = [];
  let last = '';
  FLAT_CHORDS.forEach((chord, i) => {
    if (chord && chord !== last) {
      result.push({ chord, startBeat: i });
      last = chord;
    }
  });
  return result;
})();

const CHORD_SHAPES: Record<string, number[]> = {
  C: [-1, 3, 2, 0, 1, 0], Am: [-1, 0, 2, 2, 1, 0],
  F: [1, 3, 3, 2, 1, 1], G: [3, 2, 0, 0, 0, 3],
  Dm: [-1, -1, 0, 2, 3, 1], Em: [0, 2, 2, 0, 0, 0],
  G7: [3, 2, 0, 0, 0, 1],
};

interface LyricWord { text: string; chord?: string }
interface MockLyricLine { words: LyricWord[]; beatRange: [number, number] }

const LYRIC_LINES: MockLyricLine[] = [
  { words: [{ text: 'Sunlight', chord: 'C' }, { text: ' on the ' }, { text: 'water,', chord: 'Am' }, { text: ' morning breeze' }],
    beatRange: [0, 8] },
  { words: [{ text: 'Colors', chord: 'F' }, { text: ' paint the ' }, { text: 'sky', chord: 'G' }, { text: ' as darkness flees' }],
    beatRange: [8, 16] },
  { words: [{ text: 'Oh,', chord: 'C' }, { text: ' we ' }, { text: 'dance', chord: 'Em' }, { text: ' beneath the sky' }],
    beatRange: [16, 24] },
  { words: [{ text: 'Stars', chord: 'F' }, { text: ' will ' }, { text: 'guide', chord: 'Dm' }, { text: ' us through the ' }, { text: 'night', chord: 'G' }],
    beatRange: [24, 32] },
  { words: [{ text: 'Hold', chord: 'C' }, { text: ' on ' }, { text: 'tight,', chord: 'Am' }, { text: " we'll be " }, { text: 'alright', chord: 'F' }],
    beatRange: [32, 40] },
];

interface FeatureItem { text: string; color: string; optional?: boolean }
interface FeatureTabContent {
  title: string;
  description: string;
  features: FeatureItem[];
  beta?: boolean;
  note?: string;
  link?: { href: string; label: string };
}

const TAB_CONTENT: Record<string, FeatureTabContent> = {
  'chord-grid': {
    title: 'Chords & Beats',
    description: 'A beat-aligned chord grid that follows the song as it plays.',
    features: [
      { text: 'Beat and downbeat tracking with Beat This!, chord recognition with BTC CL decoded on the beat grid', color: 'blue' },
      { text: 'Automatic time signature, and a key estimated from the audio', color: 'blue' },
      { text: 'Click any beat to jump there, and loop a section to practice it', color: 'blue' },
      { text: 'Metronome, pitch shift and chord playback', color: 'blue' },
      { text: 'Roman numerals, key changes and enharmonic corrections via Gemini', color: 'blue', optional: true },
    ],
  },
  'melody-piano': {
    title: 'Melody & Piano',
    beta: true,
    description: 'See the notes of a song on a falling-note piano roll, transcribed from the audio itself.',
    features: [
      { text: 'Vocal line transcribed from the separated vocal stem (SCNet and Basic Pitch)', color: 'orange' },
      { text: 'Instrument layers from MuScriptor: Guitar, Keys, Bass, Winds, Strings, Synth', color: 'orange' },
      { text: 'Turn each instrument layer on or off', color: 'orange' },
      { text: 'Export the transcribed tracks to MIDI', color: 'orange' },
    ],
    note: 'Sign in to run a new transcription.',
  },
  stems: {
    title: 'Split Stems',
    description: 'Separate a song into four stems and mix them yourself.',
    features: [
      { text: 'Vocals, drums, bass and other, separated with SCNet', color: 'pink' },
      { text: 'Play the stems together and adjust each one', color: 'pink' },
      { text: 'Export a karaoke track or your own custom mix as WAV', color: 'pink' },
      { text: 'Finished songs appear in your stem library', color: 'pink' },
    ],
    note: 'Sign in to split new songs. Songs already separated from YouTube can be played by anyone.',
    link: { href: '/stems', label: 'Open Split Stems' },
  },
  guitar: {
    title: 'Guitar Chord Diagrams',
    beta: true,
    description: 'Fingering charts for the chords in the song, moving along with playback.',
    features: [
      { text: 'Fingering patterns with multiple chord positions', color: 'green' },
      { text: 'Animated chord progression synced with audio playback', color: 'green' },
      { text: 'Responsive layout adapting to any screen size', color: 'green' },
    ],
  },
  lyrics: {
    title: 'Lyrics & AI',
    beta: true,
    description: 'Line up lyrics with the chords, and add AI tools with your own API keys.',
    features: [
      { text: 'Search LRCLIB for lyrics and show them on the chord grid, no key needed', color: 'purple' },
      { text: 'Lead sheet with word-level timing and chords above the words, via Music.ai', color: 'purple', optional: true },
      { text: 'Lyrics translation via Gemini', color: 'purple', optional: true },
      { text: 'Chat assistant for questions about the song, via Gemini', color: 'purple', optional: true },
    ],
  },
};

// ============================================================
// Shared helpers
// ============================================================

function useBeatAnimation() {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBeat((p) => (p + 1) % TOTAL_BEATS), BEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return beat;
}

function useProgressionIndex(beat: number): number {
  return useMemo(() => {
    for (let i = UNIQUE_PROGRESSION.length - 1; i >= 0; i--) {
      if (beat >= UNIQUE_PROGRESSION[i].startBeat) return i;
    }
    return 0;
  }, [beat]);
}

// ============================================================
// Shared chord grid — labels only on chord changes
// ============================================================

function ChordGrid({
  isDark, currentBeat, showRomanNumerals, measures,
}: {
  isDark: boolean; currentBeat: number; showRomanNumerals: boolean; measures: string[][];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-1 gap-y-1 md:grid-cols-3 lg:grid-cols-4">
      {measures.map((measure, mIdx) => {
        return (
          <div key={mIdx} className="min-w-0 px-[2px]">
            <div className={`grid grid-cols-4 gap-[2px] border-l-[3px] pl-1 ${
              isDark ? 'border-gray-500/60' : 'border-gray-400'
            }`}>
              {measure.map((chord, beatIdx) => {
                const globalIdx = mIdx * 4 + beatIdx;
                const isHighlighted = globalIdx === currentBeat;
                const isEmpty = !chord;

                const prevChord = globalIdx > 0
                  ? measures[Math.floor((globalIdx - 1) / 4)]?.[(globalIdx - 1) % 4] || ''
                  : '';
                const showLabel = !!chord && chord !== prevChord;
                const roman = showLabel ? ROMAN[chord] : undefined;

                return (
                  <div
                    key={beatIdx}
                    className={`flex flex-col items-center justify-center rounded-sm border transition-all duration-150 ${
                      showRomanNumerals ? 'aspect-[1/1.25]' : 'aspect-square'
                    } ${
                      isHighlighted
                        ? isDark
                          ? 'bg-blue-800 border-blue-400 text-blue-100'
                          : 'bg-blue-100 border-blue-600 text-blue-900'
                        : isEmpty
                          ? isDark ? 'bg-[#111720]/80 border-gray-600/40' : 'bg-gray-100 border-gray-300'
                          : isDark ? 'bg-[#111720] border-gray-600/50 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    {showLabel && (
                      <span className="font-varela text-[10px] leading-none sm:text-xs lg:text-sm">
                        {chord}
                      </span>
                    )}
                    {showRomanNumerals && roman && (
                      <span className={`mt-0.5 font-varela font-semibold leading-none ${
                        isHighlighted ? 'text-blue-200 dark:text-blue-200' : 'text-blue-700 dark:text-blue-300'
                      }`} style={{ fontSize: '8px' }}>
                        {roman}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Mockup: Beat & Chord Grid (with Roman numeral toggle)
// ============================================================

function ChordGridMockup({ isDark, currentBeat }: { isDark: boolean; currentBeat: number }) {
  const [showRoman, setShowRoman] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`rounded-xl p-3 sm:p-4 border shadow-lg ${
        isDark ? 'bg-[#1E252E] border-gray-600/60' : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
        <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Chord Progression
        </h4>
        <div className="flex items-center gap-2">
          <Tooltip content="Toggle Roman Numeral Analysis" placement="top">
            <button
              onClick={() => setShowRoman((v) => !v)}
              className={`rounded-lg px-2 py-0.5 text-xs font-medium border transition-colors cursor-pointer ${
                showRoman
                  ? isDark
                    ? 'bg-purple-800/40 border-purple-400 text-purple-100'
                    : 'bg-purple-50 border-purple-300 text-purple-800'
                  : isDark
                    ? 'bg-gray-700/40 border-gray-500 text-gray-400 hover:border-purple-400 hover:text-purple-300'
                    : 'bg-gray-50 border-gray-300 text-gray-500 hover:border-purple-300 hover:text-purple-700'
              }`}
            >Roman</button>
          </Tooltip>
          <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
            isDark ? 'bg-blue-800/40 border border-blue-400 text-blue-50' : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}>Time: 4/4</span>
          <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
            isDark ? 'bg-green-800/40 border border-green-400 text-green-50' : 'bg-green-50 border border-green-200 text-green-800'
          }`}>Key: C Major</span>
        </div>
      </div>
      <ChordGrid
        isDark={isDark}
        currentBeat={currentBeat}
        showRomanNumerals={showRoman}
        measures={MEASURES}
      />
    </motion.div>
  );
}

// ============================================================
// Mockup: Guitar Chord Diagrams (animated sliding window)
// ============================================================

function MiniChordDiagram({ frets, name, isActive, isDark }: {
  frets: number[]; name: string; isActive: boolean; isDark: boolean;
}) {
  const w = 52, h = 64;
  const pad = { top: 13, side: 7, bottom: 2 };
  const stringSp = (w - pad.side * 2) / 5;
  const fretSp = (h - pad.top - pad.bottom) / 4;
  const stroke = isDark ? '#e5e7eb' : '#6b7280';
  const dot = isActive ? '#3b82f6' : isDark ? '#d1d5db' : '#374151';

  return (
    <div className="flex flex-col items-center">
      <div className={`rounded-lg p-1 transition-colors duration-300 ${
        isActive
          ? isDark ? 'bg-blue-900/40 border border-blue-500/50' : 'bg-blue-50 border border-blue-200'
          : 'border border-transparent'
      }`}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <line x1={pad.side} y1={pad.top} x2={w - pad.side} y2={pad.top} stroke={stroke} strokeWidth="2.5" />
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={`s${i}`} x1={pad.side + stringSp * i} y1={pad.top} x2={pad.side + stringSp * i} y2={h - pad.bottom} stroke={stroke} strokeWidth="0.8" opacity="0.5" />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <line key={`f${i}`} x1={pad.side} y1={pad.top + fretSp * (i + 1)} x2={w - pad.side} y2={pad.top + fretSp * (i + 1)} stroke={stroke} strokeWidth="0.6" opacity="0.4" />
          ))}
          {frets.map((fret, i) => {
            const x = pad.side + stringSp * i;
            if (fret === -1) return <text key={`d${i}`} x={x} y={pad.top - 3} textAnchor="middle" fontSize="6" fill={stroke}>×</text>;
            if (fret === 0) return <circle key={`d${i}`} cx={x} cy={pad.top - 5} r="2" fill="none" stroke={stroke} strokeWidth="1" />;
            return <circle key={`d${i}`} cx={x} cy={pad.top + fretSp * (fret - 0.5)} r="3" fill={dot} />;
          })}
        </svg>
      </div>
      <span className={`font-varela text-[10px] sm:text-xs mt-0.5 transition-colors duration-300 ${
        isActive ? 'text-blue-500 dark:text-blue-400 font-semibold' : isDark ? 'text-gray-500' : 'text-gray-400'
      }`}>{name}</span>
    </div>
  );
}

function GuitarMockup({ isDark, currentBeat }: { isDark: boolean; currentBeat: number }) {
  const progIdx = useProgressionIndex(currentBeat);

  const VISIBLE_COUNT = 5;
  const CENTER_OFFSET = 2;
  const visibleWindow = useMemo(() => {
    let start = Math.max(0, progIdx - CENTER_OFFSET);
    const end = Math.min(UNIQUE_PROGRESSION.length, start + VISIBLE_COUNT);
    if (end - start < VISIBLE_COUNT) start = Math.max(0, end - VISIBLE_COUNT);
    return UNIQUE_PROGRESSION.slice(start, end);
  }, [progIdx]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`rounded-xl p-3 sm:p-4 border shadow-lg space-y-3 ${
        isDark ? 'bg-[#1E252E] border-gray-600/60' : 'bg-white border-gray-200'
      }`}
    >
      <div>
        <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Chord Progression
        </h4>
        <ChordGrid isDark={isDark} currentBeat={currentBeat} showRomanNumerals={false} measures={MEASURES} />
      </div>

      <div className={`border-t ${isDark ? 'border-gray-600/40' : 'border-gray-200'}`} />

      <div>
        <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Guitar Chord Diagrams
        </h4>
        <div className="flex justify-center items-end gap-1 sm:gap-2 md:gap-3 min-h-[90px]">
          <AnimatePresence mode="popLayout">
            {visibleWindow.map((entry) => {
              const isCurrent = entry === UNIQUE_PROGRESSION[progIdx];
              return (
                <motion.div
                  key={`${entry.chord}-${entry.startBeat}`}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: isCurrent ? 1.12 : 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  style={{ opacity: isCurrent ? 1 : 0.5 }}
                >
                  <MiniChordDiagram
                    name={entry.chord}
                    frets={CHORD_SHAPES[entry.chord] || [0, 0, 0, 0, 0, 0]}
                    isActive={isCurrent}
                    isDark={isDark}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Mockup: Lyrics & Chord Sync
// ============================================================

function LyricsMockup({ isDark, currentBeat }: { isDark: boolean; currentBeat: number }) {
  const activeIdx = LYRIC_LINES.findIndex(
    (l) => currentBeat >= l.beatRange[0] && currentBeat < l.beatRange[1]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`rounded-xl p-3 sm:p-4 border shadow-lg ${
        isDark ? 'bg-[#1E252E] border-gray-600/60' : 'bg-white border-gray-200'
      }`}
    >
      <h4 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
        Lead Sheet
      </h4>
      <div className="space-y-0.5">
        {LYRIC_LINES.map((line, idx) => {
          const isActive = idx === activeIdx;
          const isPast = idx < activeIdx;
          const lineProgress = isActive
            ? Math.min(1, (currentBeat - line.beatRange[0]) / (line.beatRange[1] - line.beatRange[0]))
            : 0;
          const totalChars = line.words.reduce((s, w) => s + w.text.length, 0);
          const colorPos = isActive ? Math.floor(lineProgress * totalChars) : 0;

          return (
            <div key={idx}>
              <motion.div
                animate={{
                  backgroundColor: isActive
                    ? isDark ? 'rgba(30, 64, 175, 0.15)' : 'rgba(219, 234, 254, 0.7)'
                    : 'rgba(0, 0, 0, 0)',
                  borderLeftColor: isActive
                    ? isDark ? '#3b82f6' : '#60a5fa'
                    : 'rgba(0, 0, 0, 0)',
                  scale: isActive ? 1.01 : 1,
                }}
                transition={{ duration: 0.3 }}
                className="px-2 sm:px-3 py-1.5 rounded-md border-l-3 border-transparent"
              >
                <div className="flex flex-wrap">
                  {(() => {
                    let off = 0;
                    return line.words.map((word, wi) => {
                      const start = off;
                      off += word.text.length;
                      return (
                        <div key={wi} className="relative inline-flex flex-col justify-end" style={{ whiteSpace: 'pre-wrap' }}>
                          {word.chord && (
                            <div className="relative mb-0.5">
                              <span className={`font-varela text-[10px] sm:text-xs font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                {word.chord}
                              </span>
                              <div className="absolute bottom-0 left-0 right-0 h-px" style={{ backgroundColor: isDark ? '#475569' : '#94a3b8' }} />
                            </div>
                          )}
                          <span className={`text-xs sm:text-sm ${word.chord ? 'font-medium' : ''}`}>
                            {isActive ? (
                              word.text.split('').map((ch, ci) => {
                                const played = (start + ci) < colorPos;
                                return (
                                  <span key={ci} style={{
                                    color: played ? (isDark ? '#60a5fa' : '#2563eb') : (isDark ? '#d1d5db' : '#374151'),
                                    transition: 'color 80ms',
                                  }}>{ch}</span>
                                );
                              })
                            ) : (
                              <span style={{
                                color: isPast ? (isDark ? '#60a5fa' : '#2563eb') : (isDark ? '#6b7280' : '#9ca3af'),
                                transition: 'color 0.4s',
                              }}>{word.text}</span>
                            )}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ============================================================
// Mockup: Piano Visualizer (falling notes + keyboard)
// ============================================================

function PianoVisualizerMockup() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <HeroPianoVisualizerMock
        preset="feature"
        className="mx-auto w-full max-w-[46rem] lg:max-w-[50rem]"
      />
    </motion.div>
  );
}

// ============================================================
// Mockup: Split Stems (mixer rows with animated levels)
// ============================================================

const STEM_ROWS: { name: string; pattern: number[] }[] = [
  { name: 'vocals', pattern: [0.3, 0.7, 0.9, 0.6, 0.8, 0.4, 0.7, 0.5] },
  { name: 'drums', pattern: [0.9, 0.3, 0.6, 0.3, 0.9, 0.3, 0.7, 0.4] },
  { name: 'bass', pattern: [0.7, 0.7, 0.5, 0.5, 0.6, 0.6, 0.8, 0.8] },
  { name: 'other', pattern: [0.5, 0.6, 0.4, 0.7, 0.5, 0.8, 0.6, 0.4] },
];
const STEM_BAR_COUNT = 32;

function StemsMockup({ isDark, currentBeat }: { isDark: boolean; currentBeat: number }) {
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const playhead = currentBeat % STEM_BAR_COUNT;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`rounded-xl p-3 sm:p-4 border shadow-lg ${
        isDark ? 'bg-[#1E252E] border-gray-600/60' : 'bg-white border-gray-200'
      }`}
    >
      <h4 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
        Stem Mixer
      </h4>
      <div className="space-y-3">
        {STEM_ROWS.map(({ name, pattern }) => {
          const color = getStemColor(name);
          const isMuted = !!muted[name];
          return (
            <div key={name} className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setMuted((prev) => ({ ...prev, [name]: !prev[name] }))}
                aria-pressed={!isMuted}
                className={`w-16 flex-shrink-0 rounded-lg px-2 py-1 text-xs font-medium cursor-pointer transition-opacity ${color.chip} ${
                  isMuted ? 'opacity-40' : ''
                }`}
              >
                {color.label}
              </button>
              <div className="flex h-10 min-w-0 flex-1 items-center gap-[2px]">
                {Array.from({ length: STEM_BAR_COUNT }).map((_, i) => (
                  <div
                    key={i}
                    className="min-w-0 flex-1 rounded-sm transition-opacity duration-150"
                    style={{
                      height: `${pattern[i % pattern.length] * 100}%`,
                      backgroundColor: isMuted ? (isDark ? '#4b5563' : '#d1d5db') : color.wave,
                      opacity: isMuted ? 0.5 : i <= playhead ? 1 : 0.35,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ============================================================
// Feature Content Panel
// ============================================================

const COLOR_MAP: Record<string, string> = { blue: 'text-blue-500', green: 'text-green-500', purple: 'text-purple-500', orange: 'text-orange-500', pink: 'text-pink-500' };
const FEATURE_PANEL_CLASS = 'grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-12 lg:items-stretch min-h-[40rem] md:min-h-[36rem] lg:min-h-[28rem]';
const FEATURE_TAB_CLASSNAMES = {
  base: 'mx-auto flex w-full max-w-4xl justify-center',
  tabList: 'mx-auto w-full justify-start md:justify-center rounded-full bg-white/75 px-2 py-1 shadow-sm backdrop-blur dark:bg-gray-800/50',
  cursor: 'bg-slate-900 dark:bg-gray-900',
  tab: 'text-sm sm:text-base text-gray-700 data-[selected=true]:text-white dark:text-gray-200 dark:data-[selected=true]:text-white',
  tabContent: 'text-gray-700 group-data-[selected=true]:text-white dark:text-gray-200 dark:group-data-[selected=true]:text-white',
};

function FeatureContent({ title, description, features, beta, note, link }: FeatureTabContent) {
  const hasOptional = features.some((f) => f.optional);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.05 }}
      className="flex h-full flex-col justify-center space-y-4 px-1 py-2 sm:px-2"
    >
      <h3 className="flex items-center gap-2 text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
        {title}
        {beta && (
          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">
            beta
          </span>
        )}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
      <ul className="space-y-3 mt-2">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-gray-600 dark:text-gray-400">
            <span className={`${COLOR_MAP[f.color] || 'text-blue-500'} mt-1.5 text-xs flex-shrink-0`}>●</span>
            <span className="text-sm leading-relaxed">
              {f.text}
              {f.optional && (
                <Chip size="sm" variant="flat" color="warning" className="ml-2 h-5 align-middle">Optional</Chip>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hasOptional && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Optional features need your own API key, added in{' '}
          <Link href="/settings" className="underline hover:text-blue-600 dark:hover:text-blue-400">Settings</Link>.
        </p>
      )}
      {note && <p className="text-xs text-gray-500 dark:text-gray-400">{note}</p>}
      {link && (
        <Link href={link.href} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          {link.label} →
        </Link>
      )}
    </motion.div>
  );
}

// ============================================================
// Main Export
// ============================================================

export default function FeaturesTabSection() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<string>('chord-grid');
  const beat = useBeatAnimation();

  return (
    <section id="features" className="relative py-20 bg-transparent transition-colors duration-300 overflow-hidden rounded-b-[36px]">
      <div className="absolute inset-0 z-0 pointer-events-none">
        {isDark ? (
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 50%)' }} />
        ) : (
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(255, 235, 59, 0.2) 0%, transparent 60%)' }} />
        )}
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.4 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">Features</h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Everything you can pull out of a song: chords, beats, melody, stems and lyrics
          </p>
        </motion.div>

        <Tabs
          aria-label="Feature tabs"
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as string)}
          variant="light"
          color="primary"
          classNames={{
            ...FEATURE_TAB_CLASSNAMES,
            tabList: `${FEATURE_TAB_CLASSNAMES.tabList} mb-8 max-w-4xl gap-2 sm:gap-3`,
            tab: `${FEATURE_TAB_CLASSNAMES.tab} px-3 py-2 sm:px-4`,
            panel: 'pt-0',
          }}
        >
          <Tab key="chord-grid" title="Chords & Beats">
            <div className={FEATURE_PANEL_CLASS}>
              <div className="lg:col-span-3"><ChordGridMockup isDark={isDark} currentBeat={beat} /></div>
              <div className="lg:col-span-2"><FeatureContent {...TAB_CONTENT['chord-grid']} /></div>
            </div>
          </Tab>
          <Tab key="melody-piano" title="Melody & Piano">
            <div className={FEATURE_PANEL_CLASS}>
              <div className="lg:col-span-3"><PianoVisualizerMockup /></div>
              <div className="lg:col-span-2"><FeatureContent {...TAB_CONTENT['melody-piano']} /></div>
            </div>
          </Tab>
          <Tab key="stems" title="Split Stems">
            <div className={FEATURE_PANEL_CLASS}>
              <div className="lg:col-span-3"><StemsMockup isDark={isDark} currentBeat={beat} /></div>
              <div className="lg:col-span-2"><FeatureContent {...TAB_CONTENT['stems']} /></div>
            </div>
          </Tab>
          <Tab key="guitar" title="Guitar">
            <div className={FEATURE_PANEL_CLASS}>
              <div className="lg:col-span-3"><GuitarMockup isDark={isDark} currentBeat={beat} /></div>
              <div className="lg:col-span-2"><FeatureContent {...TAB_CONTENT['guitar']} /></div>
            </div>
          </Tab>
          <Tab key="lyrics" title="Lyrics & AI">
            <div className={FEATURE_PANEL_CLASS}>
              <div className="lg:col-span-3"><LyricsMockup isDark={isDark} currentBeat={beat} /></div>
              <div className="lg:col-span-2"><FeatureContent {...TAB_CONTENT['lyrics']} /></div>
            </div>
          </Tab>
        </Tabs>
      </div>
    </section>
  );
}
