'use client';

import React from 'react';
import Link from 'next/link';
import { HiChevronLeft, HiPencil, HiCheck, HiXMark } from 'react-icons/hi2';
import { BsSnow } from 'react-icons/bs';
import AppTooltip from '@/components/common/AppTooltip';

interface AnalysisHeaderProps {
  videoTitle: string;
  isEditMode: boolean;
  editedTitle: string;
  onTitleChange: (title: string) => void;
  onEditToggle: () => void;
  onTitleSave: () => void;
  onTitleCancel: () => void;
  showCorrectedChords: boolean;
  hasCorrections: boolean;
  toggleEnharmonicCorrection: () => void;
  isTranscribingLyrics: boolean;
  hasCachedLyrics: boolean;
  canTranscribe: boolean;
  transcribeLyricsWithAI: () => void;
  lyricsError: string | null;
  isSnowEligible?: boolean;
  snowEnabled?: boolean;
  onToggleSnow?: () => void;
}

const iconButtonClassName = 'flex h-11 w-11 flex-shrink-0 items-center justify-center transition-colors md:h-auto md:w-auto md:p-1';

const AnalysisHeader: React.FC<AnalysisHeaderProps> = ({
  videoTitle,
  isEditMode,
  editedTitle,
  onTitleChange,
  onEditToggle,
  onTitleSave,
  onTitleCancel,
  showCorrectedChords,
  hasCorrections,
  toggleEnharmonicCorrection,
  isTranscribingLyrics,
  hasCachedLyrics,
  canTranscribe,
  transcribeLyricsWithAI,
  lyricsError,
  isSnowEligible = false,
  snowEnabled = true,
  onToggleSnow,
}) => {
  const enharmonicTooltip = showCorrectedChords
    ? 'Show original chord spellings'
    : 'Show corrected enharmonic spellings';

  const transcribeTooltip = !canTranscribe
    ? 'Add your Music.AI API key in Settings to enable lyrics transcription'
    : isTranscribingLyrics
      ? 'Transcription in progress...'
      : 'AI transcription from audio (word-level sync)';

  return (
    <div className="mb-2 mt-0 rounded-2xl border border-default-200/80 bg-default-100/50 px-1 py-0 shadow-sm md:px-3 md:py-1.5 transition-colors duration-300 dark:border-white/10 dark:bg-gray-800/30 dark:backdrop-blur-md sm:px-4 sm:py-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 w-full md:w-auto sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="hidden font-medium text-lg text-gray-800 dark:text-gray-100 transition-colors duration-300 md:block">
              Analysis Results
            </h3>
            <div className="flex items-center gap-1 md:mt-1 md:gap-2">
              <Link
                href="/songs"
                aria-label="Back to songs"
                className="flex h-11 w-9 flex-shrink-0 items-center justify-center text-gray-600 dark:text-gray-300 md:hidden"
              >
                <HiChevronLeft className="h-6 w-6" aria-hidden />
              </Link>
              {isEditMode ? (
                <div className="flex min-w-0 items-center gap-1 flex-1 md:gap-2">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => onTitleChange(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-default-300 bg-background px-2 py-1 text-sm text-gray-800 dark:border-white/10 dark:bg-gray-800/50 dark:text-gray-100"
                    placeholder="Enter song title..."
                    autoFocus
                  />
                  <AppTooltip content="Save title">
                    <button
                      onClick={onTitleSave}
                      className={`${iconButtonClassName} text-green-600 hover:text-green-700`}
                      aria-label="Save title"
                    >
                      <HiCheck className="w-4 h-4" />
                    </button>
                  </AppTooltip>
                  <AppTooltip content="Cancel edit">
                    <button
                      onClick={onTitleCancel}
                      className={`${iconButtonClassName} text-red-600 hover:text-red-700`}
                      aria-label="Cancel edit"
                    >
                      <HiXMark className="w-4 h-4" />
                    </button>
                  </AppTooltip>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300 truncate flex-1">
                    {videoTitle}
                  </p>
                  <AppTooltip content="Edit song title and chords">
                    <button
                      onClick={onEditToggle}
                      className={`${iconButtonClassName} text-gray-500 hover:text-blue-600`}
                      aria-label="Edit song title and chords"
                    >
                      <HiPencil className="w-4 h-4" />
                    </button>
                  </AppTooltip>
                </>
              )}
            </div>
          </div>

        </div>

        <div className="hidden md:flex gap-2 flex-shrink-0">
          {isSnowEligible && (
            <AppTooltip content={snowEnabled ? 'Disable snow animation' : 'Enable snow animation'}>
              <button
                onClick={onToggleSnow}
                className={`flex items-center justify-center p-1.5 rounded-lg border font-medium transition-colors duration-200 ${
                  snowEnabled
                    ? 'bg-blue-100 dark:bg-blue-200 border-blue-300 dark:border-blue-400 text-blue-800 dark:text-blue-900 hover:bg-blue-200 dark:hover:bg-blue-300'
                    : 'bg-gray-50 dark:bg-gray-200 border-gray-200 dark:border-gray-300 text-gray-600 dark:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-300'
                }`}
                aria-label="Toggle snow animation"
              >
                <BsSnow className={`w-4.5 h-4.5 text-current ${snowEnabled ? 'animate-[spin_8s_linear_infinite]' : ''}`} />
              </button>
            </AppTooltip>
          )}

          {hasCorrections && (
            <AppTooltip content={enharmonicTooltip}>
              <button
                onClick={toggleEnharmonicCorrection}
                className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors duration-200 whitespace-nowrap ${
                  showCorrectedChords
                    ? 'bg-blue-100 dark:bg-blue-200 border-blue-300 dark:border-blue-400 text-blue-800 dark:text-blue-900 hover:bg-blue-200 dark:hover:bg-blue-300'
                    : 'bg-gray-50 dark:bg-gray-200 border-gray-200 dark:border-gray-300 text-gray-600 dark:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-300'
                }`}
              >
                {showCorrectedChords ? 'Show Original' : 'Fix Enharmonics'}
              </button>
            </AppTooltip>
          )}

          <AppTooltip content={transcribeTooltip}>
            <span className="inline-flex">
              <button
                onClick={transcribeLyricsWithAI}
                disabled={isTranscribingLyrics || !canTranscribe}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap ${
                  canTranscribe
                    ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                    : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                }`}
              >
                {isTranscribingLyrics
                  ? 'Transcribing...'
                  : !canTranscribe
                    ? 'API Key Required'
                    : (hasCachedLyrics ? 'Re-transcribe' : 'Lyrics Transcribe')}
              </button>
            </span>
          </AppTooltip>
        </div>
      </div>

      {lyricsError && (
        <div
          className={`mt-2 ${
            lyricsError.includes('Transcribing lyrics')
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-red-500'
          }`}
        >
          {lyricsError}
        </div>
      )}
    </div>
  );
};

export default AnalysisHeader;
export { AnalysisHeader };