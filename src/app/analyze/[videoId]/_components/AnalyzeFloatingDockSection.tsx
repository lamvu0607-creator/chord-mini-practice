'use client';

import type { ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import FloatingVideoDock from '@/components/analysis/FloatingVideoDock';
import UtilityBar from '@/components/analysis/UtilityBar';
import { isUploadSourceId } from '@/utils/uploadSourceId';
import type { AnalyzeFloatingDockSectionProps, AnalyzePageViewModel } from '../_types/analyzePageViewModel';

const ResponsiveVideoUtilityLayout = dynamic(() => import('@/components/layout/ResponsiveVideoUtilityLayout'), {
  loading: () => <div className="h-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false,
});

interface AnalyzeFloatingDockSectionComponentProps {
  floatingDockProps: AnalyzeFloatingDockSectionProps;
  utilityBarProps: AnalyzePageViewModel['utilityBarProps'];
  videoId: string;
  videoTitle?: string;
}

export default function AnalyzeFloatingDockSection({
  floatingDockProps,
  utilityBarProps,
  videoId,
  videoTitle,
}: AnalyzeFloatingDockSectionComponentProps) {
  if (!floatingDockProps.analysisResults) {
    return null;
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
      utilityBar={(
        <UtilityBar
          className="hidden md:block"
          {...utilityBarProps}
          stemsVideoId={isUploadSourceId(videoId) ? undefined : videoId}
          clipVideoId={videoId}
          stemsTitle={videoTitle}
        />
      )}
    />
  );
}
