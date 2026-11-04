'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

interface ResponsiveVideoUtilityLayoutProps {
  videoPlayer: React.ReactNode;
  utilityBar: React.ReactNode;
  isVideoMinimized: boolean;
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
}

/** Utility dock and video side by side from 768px up. Phones use MobileSongDock instead. */
export const ResponsiveVideoUtilityLayout: React.FC<ResponsiveVideoUtilityLayoutProps> = ({
  videoPlayer,
  utilityBar,
  isVideoMinimized,
  isChatbotOpen,
  isLyricsPanelOpen,
}) => {
  const [videoHeight, setVideoHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const layoutContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const videoContainer = videoContainerRef.current;
    const layoutContainer = layoutContainerRef.current;
    if (!videoContainer || !layoutContainer) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === videoContainer) setVideoHeight(entry.contentRect.height);
        if (entry.target === layoutContainer) setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(videoContainer);
    resizeObserver.observe(layoutContainer);
    return () => resizeObserver.disconnect();
  }, []);

  const videoWidthPx = useMemo(() => {
    const minW = isVideoMinimized ? 160 : 280;
    const maxW = isVideoMinimized ? 240 : 560;
    if (!containerWidth) return minW;
    const multiplier = isVideoMinimized ? 0.15 : 0.3;
    return Math.round(Math.max(minW, Math.min(containerWidth * multiplier, maxW)));
  }, [containerWidth, isVideoMinimized]);

  const utilityBarWidth = useMemo(() => {
    if (containerWidth === 0) return '100%';
    return Math.max(containerWidth - videoWidthPx - 48, 300);
  }, [containerWidth, videoWidthPx]);

  const panelsOpen = isChatbotOpen || isLyricsPanelOpen;
  const baseOverlap = Math.max(0, Math.min(Math.round(videoHeight * (panelsOpen ? 0.85 : 0.95)), 420));
  const extraLift = panelsOpen ? 32 : 104;

  return (
    <div
      ref={layoutContainerRef}
      className="pointer-events-none relative z-[60] flex flex-row items-end gap-3 px-4 pb-0"
      style={{
        ...(panelsOpen ? { maxWidth: 'calc(var(--analysis-left-pane-width, 100vw) + 2rem)' } : undefined),
        marginTop: baseOverlap ? -(baseOverlap + extraLift) : (panelsOpen ? -28 : -88),
      }}
    >
      <div
        className="pointer-events-auto relative z-[1] order-1 min-w-0 max-w-full flex-1"
        style={{
          maxWidth: typeof utilityBarWidth === 'number' ? `${utilityBarWidth}px` : utilityBarWidth,
          minWidth: '280px',
        }}
      >
        <div className="overflow-visible">
          <div className="inline-flex w-max min-w-full">{utilityBar}</div>
        </div>
      </div>

      <div
        ref={videoContainerRef}
        className="pointer-events-auto relative z-[1] order-2 flex-shrink-0 transition-all duration-300"
        style={{
          width: `${videoWidthPx}px`,
          minWidth: isVideoMinimized ? '160px' : '260px',
          maxWidth: isVideoMinimized ? '240px' : '560px',
        }}
      >
        {videoPlayer}
      </div>
    </div>
  );
};

export default ResponsiveVideoUtilityLayout;
