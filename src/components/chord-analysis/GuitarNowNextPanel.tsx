'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useCurrentBeatIndex } from '@/stores/playbackStore';
import { formatChordWithMusicalSymbols } from '@/utils/chordFormatting';

const GuitarChordDiagram = dynamic(() => import('@/components/chord-playback/GuitarChordDiagram'), {
  loading: () => <div className="h-24 w-20 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />,
  ssr: false,
});

type ChordData = React.ComponentProps<typeof GuitarChordDiagram>['chordData'];

export interface GuitarProgressionItem {
  /** Shape name (what the guitarist fingers with the capo on). */
  chord: string;
  /** Grid beat index where this chord starts. */
  startIndex: number;
  timestamp: number;
}

interface GuitarNowNextPanelProps {
  progression: GuitarProgressionItem[];
  chordDataCache: Map<string, ChordData | null>;
  chordPositions: Record<string, number>;
  /** Sounding name for a progression item, when it differs from the shape name (capo on). */
  getSoundingName: (item: GuitarProgressionItem) => string | undefined;
  onPositionChange: (chordName: string, positionIndex: number) => void;
  capoFret: number;
  /** Width of the "Now" diagram; the "Next" diagram is about two thirds of it. */
  diagramWidth: number;
}

function isNoChordName(chord: string): boolean {
  return !chord || chord === 'N.C.' || chord === 'N' || chord === 'N/C' || chord === 'NC';
}

const MAX_COUNTDOWN_DOTS = 8;
const THEN_COUNT = 4;

function ChordName({ name, className }: { name: string; className: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(name, false) }}
    />
  );
}

/**
 * Animated view of the Guitar tab: the chord being played now with its
 * fingering, the next chord with a beat countdown, and the chords after it.
 */
export const GuitarNowNextPanel: React.FC<GuitarNowNextPanelProps> = ({
  progression,
  chordDataCache,
  chordPositions,
  getSoundingName,
  onPositionChange,
  capoFret,
  diagramWidth,
}) => {
  const currentBeatIndex = useCurrentBeatIndex();

  const currentIndex = useMemo(() => {
    if (progression.length === 0) return -1;
    let index = 0;
    for (let i = 0; i < progression.length; i++) {
      if (progression[i].startIndex <= currentBeatIndex) index = i; else break;
    }
    return index;
  }, [progression, currentBeatIndex]);

  if (currentIndex < 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No chords detected in this song</p>
    );
  }

  const isBeforeFirstChord = currentBeatIndex < progression[0].startIndex;
  const current = isBeforeFirstChord ? null : progression[currentIndex];
  const now = current && !isNoChordName(current.chord) ? current : null;
  const upcoming = progression
    .slice(isBeforeFirstChord ? 0 : currentIndex + 1)
    .filter((item) => !isNoChordName(item.chord));
  const next = upcoming[0] ?? null;
  const later = upcoming.slice(1, 1 + THEN_COUNT);
  const beatsToNext = next ? Math.max(1, next.startIndex - Math.max(currentBeatIndex, 0)) : 0;
  const dotCount = Math.min(beatsToNext, MAX_COUNTDOWN_DOTS);
  const nowSounding = now ? getSoundingName(now) : undefined;
  const nextSounding = next ? getSoundingName(next) : undefined;
  const nextWidth = Math.round(diagramWidth * 0.64);

  const cardClassName = 'min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-content-bg';
  const eyebrowClassName = 'text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 sm:text-sm';

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" data-testid="guitar-now-next">
      <section className={`${cardClassName} flex items-center gap-4 sm:gap-6`} aria-live="polite" aria-label="Now playing">
        <div className="shrink-0">
          {now ? (
            <GuitarChordDiagram
              chordData={chordDataCache.get(now.chord) || null}
              positionIndex={chordPositions[now.chord] || 0}
              size="large"
              customWidth={diagramWidth}
              customHeight={Math.round(diagramWidth * 1.28)}
              showChordName={false}
              displayName={now.chord}
              isFocused
              showPositionSelector
              onPositionChange={(positionIndex) => onPositionChange(now.chord, positionIndex)}
              capoFret={capoFret}
              capoLabelMode="shape"
            />
          ) : (
            <div
              className="grid place-items-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400"
              style={{ width: diagramWidth, height: Math.round(diagramWidth * 1.28) }}
            >
              {isBeforeFirstChord ? 'Intro' : 'Rest'}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className={eyebrowClassName}>Now playing</div>
          {now ? (
            <ChordName name={now.chord} className="mt-1 block font-varela text-5xl font-semibold leading-none text-gray-900 dark:text-gray-100 sm:text-6xl" />
          ) : (
            <span className="mt-1 block font-varela text-4xl text-gray-400 dark:text-gray-500">N.C.</span>
          )}
          {nowSounding && (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Sounds as <ChordName name={nowSounding} className="font-semibold text-gray-800 dark:text-gray-200" />
            </div>
          )}
        </div>
      </section>

      <section className={`${cardClassName} flex flex-col gap-3`} aria-label="Next chord">
        <div className="flex items-center gap-4">
          {next && (
            <div className="shrink-0">
              <GuitarChordDiagram
                chordData={chordDataCache.get(next.chord) || null}
                positionIndex={chordPositions[next.chord] || 0}
                size="medium"
                customWidth={nextWidth}
                customHeight={Math.round(nextWidth * 1.28)}
                showChordName={false}
                displayName={next.chord}
                capoFret={capoFret}
                capoLabelMode="shape"
              />
            </div>
          )}
          <div className="min-w-0">
            <div className={eyebrowClassName}>Next</div>
            {next ? (
              <>
                <ChordName name={next.chord} className="mt-1 block font-varela text-3xl font-semibold leading-none text-gray-900 dark:text-gray-100" />
                {nextSounding && (
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    Sounds as <ChordName name={nextSounding} className="font-semibold" />
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: dotCount }, (_, i) => (
                      <i
                        key={i}
                        className={`block h-2 w-2 rounded-full ${i === dotCount - 1 ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      />
                    ))}
                  </span>
                  <span>{beatsToNext <= 1 ? 'next beat' : `in ${beatsToNext} beats`}</span>
                </div>
              </>
            ) : (
              <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">End of song</span>
            )}
          </div>
        </div>
        {later.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
            <span className={eyebrowClassName}>Then</span>
            {later.map((item) => (
              <ChordName
                key={item.startIndex}
                name={item.chord}
                className="rounded-md border border-gray-200 px-2 py-0.5 font-varela text-sm text-gray-800 dark:border-gray-600 dark:text-gray-200"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default GuitarNowNextPanel;
