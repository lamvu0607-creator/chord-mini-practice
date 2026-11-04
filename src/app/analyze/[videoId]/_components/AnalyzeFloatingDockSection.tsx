'use client';

import type { ComponentProps, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import FloatingVideoDock from '@/components/analysis/FloatingVideoDock';
import UtilityBar from '@/components/analysis/UtilityBar';
import { useIsMobile } from '@/hooks/ui/useIsMobile';
import { isUploadSourceId } from '@/utils/uploadSourceId';
import type { AnalyzeFloatingDockSectionProps, AnalyzePageViewModel } from '../_types/analyzePageViewModel';

const ResponsiveVideoUtilityLayout = dynamic(() => import('@/components/layout/ResponsiveVideoUtilityLayout'), {
  loading: () => <div className="h-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false,
});

const MobileSongDock = dynamic(() => import('@/components/analysis/MobileSongDock'), { ssr: false });

interface AnalyzeFloatingDockSectionComponentProps {
  floatingDockProps: AnalyzeFloatingDockSectionProps;
  utilityBarProps: AnalyzePageViewModel['utilityBarProps'];
  videoId: string;
  videoTitle?: string;
  /** Song actions that have no room in the phone header. */
  mobileActions?: ReactNode;
}

export default function AnalyzeFloatingDockSection({
  floatingDockProps,
  utilityBarProps,
  videoId,
  videoTitle,
  mobileActions,
}: AnalyzeFloatingDockSectionComponentProps) {
  const isMobile = useIsMobile();

  if (!floatingDockProps.analysisResults) {
    return null;
  }

  const utilityBar = (
    <UtilityBar
      {...utilityBarProps}
      variant={isMobile ? 'sheet' : 'dock'}
      stemsVideoId={isUploadSourceId(videoId) ? undefined : videoId}
      clipVideoId={videoId}
      stemsTitle={videoTitle}
    />
  );

  if (isMobile) {
    return (
      <MobileSongDock
        player={floatingDockProps.videoPlayerProps as unknown as ComponentProps<typeof MobileSongDock>['player']}
        tools={(
          <>
            {utilityBar}
            {mobileActions}
          </>
        )}
      />
    );
  }

  return (
    <ResponsiveVideoUtilityLayout
      isVideoMinimized={floatingDockProps.isVideoMinimized}
      isChatbotOpen={floatingDockProps.isChatbotOpen}
      isLyricsPanelOpen={floatingDockProps.isLyricsPanelOpen}
      videoPlayer={(
        <FloatingVideoDock
          {...(floatingDockProps.videoPlayerProps as unknown as ComponentProps<typeof FloatingVideoDock>)}
        />
      )}
      utilityBar={utilityBar}
    />
  );
}
