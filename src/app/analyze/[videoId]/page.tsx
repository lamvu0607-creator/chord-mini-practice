"use client";

import type { ComponentProps } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { readAnalyzeRouteParams } from '@/utils/analyzeRouteUtils';
import ConditionalPlaybackControls from '@/components/chord-playback/ConditionalPlaybackControls';
import PitchShiftAudioManager from '@/components/chord-playback/PitchShiftAudioManager';
import KeySignatureSync from '@/components/analysis/KeySignatureSync';
import { ChordPlaybackManager } from '@/components/chord-playback/ChordPlaybackManager';
import AnalysisSplitLayout from '@/components/layout/AnalysisSplitLayout';
import AnalyzePageChrome from './_components/AnalyzePageChrome';
import AnalyzeResultsPane from './_components/AnalyzeResultsPane';
import AnalyzeSidePanels from './_components/AnalyzeSidePanels';
import AnalyzeFloatingDockSection from './_components/AnalyzeFloatingDockSection';
import MobileSongActions from './_components/MobileSongActions';
import AnalyzeClipControl from '@/components/analysis/AnalyzeClipControl';
import { MOBILE_VIDEO_HEIGHT_VAR } from '@/components/analysis/mobileSongLayout';
import { useIsMobile } from '@/hooks/ui/useIsMobile';
import { useAnalyzePageViewModel } from './_hooks/useAnalyzePageViewModel';
import dynamic from 'next/dynamic';
import { AnalysisControlsSkeleton } from '@/components/common/SkeletonLoaders';

const DynamicAnalysisControls = dynamic(
  () => import('@/components/analysis/AnalysisControls').then(mod => ({ default: mod.AnalysisControls })),
  {
    loading: () => <AnalysisControlsSkeleton />,
    ssr: false,
  }
);

export default function YouTubeVideoAnalyzePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const videoId = params?.videoId as string;
  const routeParams = readAnalyzeRouteParams(searchParams);
  const viewModel = useAnalyzePageViewModel({ videoId, routeParams });
  const isMobile = useIsMobile();
  const isChatbotOpen = viewModel.sidePanelsProps.isChatbotOpen;
  const results = viewModel.resultsPaneProps;

  return (
    <div className="relative min-h-[100dvh] bg-background dark:bg-slate-900">
      <ConditionalPlaybackControls
        youtubePlayer={viewModel.youtubePlayer}
        setIsPlaying={viewModel.setIsPlaying}
        setCurrentTime={viewModel.setCurrentTime}
        setAudioPlayerState={viewModel.setAudioPlayerState}
      >
        {() => (
          <>
            <PitchShiftAudioManager
              youtubePlayer={viewModel.youtubePlayer}
              audioRef={viewModel.audioRef}
              cachedAudioUrl={viewModel.audioUrl}
              isPlaying={viewModel.audioPlayerState.isPlaying}
              currentTime={viewModel.audioPlayerState.currentTime}
              playbackRate={viewModel.audioPlayerState.playbackRate}
              setIsPlaying={viewModel.setIsPlaying}
              setCurrentTime={viewModel.setCurrentTime}
            />

            <KeySignatureSync keySignature={viewModel.keySignature} />

            <ChordPlaybackManager
              currentBeatIndex={viewModel.currentBeatIndex}
              chordGridData={viewModel.chordGridData as unknown as ComponentProps<typeof ChordPlaybackManager>['chordGridData']}
              isPlaying={viewModel.audioPlayerState.isPlaying}
              currentTime={viewModel.audioPlayerState.currentTime}
              audioUrl={viewModel.audioUrl}
              bpm={viewModel.bpm}
              timeSignature={viewModel.timeSignature}
              onChordPlaybackChange={viewModel.handleChordPlaybackChange}
            />

            <div className="relative z-30 isolate flex min-h-[100dvh] flex-col overflow-hidden bg-background dark:bg-slate-900 transition-colors duration-300">
              <div className="relative z-10 flex min-h-[100dvh] flex-col">
                <AnalyzePageChrome {...viewModel.chromeProps} />

                <div
                  className="relative z-20 flex-1 min-h-0"
                  style={{ paddingTop: `var(${MOBILE_VIDEO_HEIGHT_VAR}, 0px)` }}
                >
                  <div className="px-2 pt-2 pb-1 md:px-4">
                    <div suppressHydrationWarning>
                      {/* suppressHydrationWarning keeps the shell stable while dynamic controls hydrate */}
                      <DynamicAnalysisControls
                        {...viewModel.controlsProps}
                        secondaryAction={(
                          <AnalyzeClipControl
                            videoId={videoId}
                            title={viewModel.chromeProps.videoTitle}
                            variant="button"
                            isDisabled={!viewModel.controlsProps.isExtracted || viewModel.controlsProps.isAnalyzing}
                          />
                        )}
                      />
                    </div>
                  </div>

                  <div
                    className="min-h-0 px-2 pb-1 transition-[height] duration-300 md:px-4"
                    style={{ height: viewModel.splitLayoutHeight }}
                  >
                    <AnalysisSplitLayout
                      isSplit={isChatbotOpen && !isMobile}
                      storageKey="analysis-split-layout-sidepanels-v3"
                      defaultDesktopLayout={[60, 40]}
                      defaultMobileLayout={[66, 34]}
                      left={(
                        <div className="md:pr-2">
                          <AnalyzeResultsPane {...viewModel.resultsPaneProps} />
                        </div>
                      )}
                      right={<AnalyzeSidePanels {...viewModel.sidePanelsProps} />}
                    />
                  </div>
                </div>

                <AnalyzeFloatingDockSection
                  floatingDockProps={viewModel.floatingDockProps}
                  utilityBarProps={viewModel.utilityBarProps}
                  videoId={videoId}
                  videoTitle={viewModel.chromeProps.videoTitle}
                  mobileActions={<MobileSongActions {...results} />}
                />

                {isMobile && isChatbotOpen && (
                  <div className="fixed inset-0 z-[100] bg-background pb-[env(safe-area-inset-bottom,0px)] dark:bg-slate-900">
                    <AnalyzeSidePanels {...viewModel.sidePanelsProps} />
                  </div>
                )}
              </div>
            </div>

            {viewModel.analysisResults ? (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-24 z-0 hidden h-28 overflow-hidden md:block">
                {viewModel.chromeProps.analyzeBackdropUrl ? (
                  <div
                    className="absolute inset-[-18%] scale-110 bg-cover bg-center opacity-24 blur-3xl saturate-150 dark:opacity-28"
                    style={{ backgroundImage: `url("${viewModel.chromeProps.analyzeBackdropUrl}")` }}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/36 to-white/82 dark:via-slate-950/30 dark:to-slate-950/84" />
                <div className="absolute left-1/2 top-0 h-20 w-[92vw] max-w-[1180px] -translate-x-1/2 rounded-full bg-sky-400/10 blur-3xl dark:bg-sky-300/8" />
              </div>
            ) : null}
          </>
        )}
      </ConditionalPlaybackControls>
    </div>
  );
}
