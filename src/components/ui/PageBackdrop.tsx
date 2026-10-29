'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/contexts/ThemeContext';

// Dynamic import for LightRays WebGL background
const LightRays = dynamic(() => import('@/components/ui/LightRays'), { ssr: false });

/**
 * Fixed full-screen homepage background (warm cream / black with light rays).
 * Pages using it should render <Navigation overlay /> and a `relative z-10` content wrapper.
 */
export default function PageBackdrop() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 z-0 h-screen pointer-events-none overflow-hidden">
      <div className={`h-full w-full relative overflow-hidden ${isDark ? 'bg-black' : 'bg-[#faf6ee]'}`}>
        {mounted && (
          <div className="absolute inset-0 z-0">
            <LightRays
              lightSpread={0.1}
              saturation={0}
              mouseInfluence={0}
              pulsating={true}
              noiseAmount={0.1}
              raysColor={isDark ? '#f1ebe6' : '#ffe082'}
              raysSpeed={0.5}
              fadeDistance={2}
            />
          </div>
        )}
      </div>
    </div>
  );
}
