'use client';

import type { AnalyzeResultsPaneProps } from '../_types/analyzePageViewModel';

const buttonClassName = 'min-h-11 rounded-lg border border-divider px-3 text-sm font-medium text-gray-800 disabled:opacity-50 dark:border-white/10 dark:text-gray-100';

type MobileSongActionsProps = Pick<
  AnalyzeResultsPaneProps,
  | 'hasCorrections'
  | 'showCorrectedChords'
  | 'toggleEnharmonicCorrection'
  | 'canTranscribe'
  | 'isTranscribingLyrics'
  | 'hasCachedLyrics'
  | 'transcribeLyricsWithAI'
  | 'isSnowEligible'
  | 'snowEnabled'
  | 'onToggleSnow'
>;

/** Song actions shown in the desktop header. On phones they live in the Tools sheet. */
export default function MobileSongActions({
  hasCorrections,
  showCorrectedChords,
  toggleEnharmonicCorrection,
  canTranscribe,
  isTranscribingLyrics,
  hasCachedLyrics,
  transcribeLyricsWithAI,
  isSnowEligible,
  snowEnabled,
  onToggleSnow,
}: MobileSongActionsProps) {
  const transcribeLabel = isTranscribingLyrics
    ? 'Transcribing...'
    : !canTranscribe
      ? 'Lyrics transcription: API key required'
      : hasCachedLyrics ? 'Re-transcribe lyrics' : 'Transcribe lyrics';

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-divider pt-4 dark:border-white/10">
      {hasCorrections && (
        <button type="button" className={buttonClassName} onClick={toggleEnharmonicCorrection}>
          {showCorrectedChords ? 'Show original chord spellings' : 'Fix enharmonic spellings'}
        </button>
      )}
      <button
        type="button"
        className={buttonClassName}
        disabled={isTranscribingLyrics || !canTranscribe}
        onClick={() => void transcribeLyricsWithAI()}
      >
        {transcribeLabel}
      </button>
      {isSnowEligible && (
        <button type="button" className={buttonClassName} onClick={onToggleSnow}>
          {snowEnabled ? 'Turn off snow' : 'Turn on snow'}
        </button>
      )}
    </div>
  );
}
