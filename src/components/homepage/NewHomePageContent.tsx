"use client";

import { useState, useRef, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/common/Navigation';
import PageBackdrop from '@/components/ui/PageBackdrop';
import AnimatedTitle from '@/components/homepage/AnimatedTitle';
import HeroChordGridLyricsMock from '@/components/homepage/HeroChordGridLyricsMock';
import HeroPianoVisualizerMock from '@/components/homepage/HeroPianoVisualizerMock';
import HeroScrollingChordAnimation from '@/components/homepage/HeroScrollingChordAnimation';
import IntegratedSearchContainer from '@/components/homepage/LazyIntegratedSearchContainer';

import { useTheme } from '@/contexts/ThemeContext';
import { IoMusicalNotes, IoMusicalNote } from 'react-icons/io5';
import { useSearchBoxVisibility } from '@/hooks/ui/useSearchBoxVisibility';
import { useSharedSearchState } from '@/hooks/search/useSharedSearchState';
import { motion, useScroll, useTransform } from 'framer-motion';
// import { WarningBanner } from '@/components/WarningBanner';
import FeaturesTabSection from '@/components/homepage/FeaturesTabSection';


// Dynamic imports for heavy components
const RecentVideos = dynamic(() => import('@/components/homepage/LazyRecentVideos'), {
  loading: () => (
    <div className="w-full bg-content1 dark:bg-content1 border border-divider dark:border-divider rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider dark:border-divider">
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
      <div className="h-96 overflow-hidden p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-full bg-content2 dark:bg-content2 border border-divider dark:border-divider rounded-md">
              <div className="p-3">
                <div className="flex gap-3">
                  <div className="w-20 h-12 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
  ssr: false
});

function NewHomePageContentInner() {
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Track when component has mounted to prevent hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Scroll-based animations
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  // const heroScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.95]);

  // Use shared search state for synchronization between main and sticky search
  const {
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    updateSearchQuery,
    handleSearch,
    handleVideoSelect,
    setSearchError
  } = useSharedSearchState();
  const shouldHideHeroMarquee = isSearching || searchResults.length > 0;

  // Search box visibility detection for sticky search bar
  const { elementRef: searchBoxRef, shouldShowStickySearch } = useSearchBoxVisibility();

  // Handle URL query parameters for search
  useEffect(() => {
    const query = searchParams.get('q');
    if (query && query !== searchQuery) {
      updateSearchQuery(query);
    }
  }, [searchParams, searchQuery, updateSearchQuery]);

  return (
    <div className="relative flex flex-col min-h-screen transition-colors duration-300">
      <PageBackdrop />

      {/* Navigation */}
      <Navigation showStickySearch={shouldShowStickySearch} overlay />


      {/* <WarningBanner /> */}

      
      {/* Hero Section - Adjusted for navigation bar visibility */}
      <motion.section
        style={{
          opacity: heroOpacity,
          // scale: heroScale,
          minHeight: 'calc(100vh - 20px)',
        }}
        className="relative z-10 flex items-center justify-center overflow-hidden bg-transparent"
      >
        {/* Decorative Music Notes - Only show after hydration to prevent mismatch */}
        {mounted && (
          <>
            <IoMusicalNote className="absolute top-8 left-8 w-8 h-8 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" />
            <IoMusicalNotes className="absolute top-8 right-8 w-12 h-12 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" />
          </>
        )}

        {/* Split-Screen Layout */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center pt-24 pb-20 lg:pb-24">
          {/* Left Side: Hero Content (60%) */}
          <div className="lg:col-span-3 lg:self-center flex flex-col">
            <div className="space-y-8 flex flex-col">
              {/* Title - Centered */}
              <div ref={titleRef} className="text-center">
                <AnimatedTitle text="Chord Mini" className="mb-3" />
                <div className="min-h-[2rem] flex items-center justify-center mt-2">
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      delay: 0.3,
                      duration: 0.8,
                      ease: "easeOut",
                    }}
                    className="text-base md:text-lg text-slate-600 dark:text-gray-200 font-normal tracking-wide text-center leading-relaxed max-w-lg mx-auto"
                  >
                    Turn any song into chords, beats, melody and stems. Search YouTube or upload your own audio.
                  </motion.p>
                </div>
              </div>

              {/* Search Container - Above guitar chord animation */}
              <IntegratedSearchContainer
                searchQuery={searchQuery}
                setSearchQuery={updateSearchQuery}
                handleSearch={handleSearch}
                isSearching={isSearching}
                searchError={searchError}
                error={error}
                setError={setError}
                setSearchError={setSearchError}
                searchResults={searchResults}
                handleVideoSelect={handleVideoSelect}
                containerRef={searchBoxRef}
              />

              {/* Hide the marquee while the search panel is active to prevent hero layout shift. */}
              {!shouldHideHeroMarquee && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.05, duration: 0.6 }}
                  className="flex justify-center"
                >
                  <HeroScrollingChordAnimation className="w-full max-w-6xl" />
                </motion.div>
              )}
            </div>
          </div>

          {/* Right Side: Demo Images (40%) */}
          <div className="lg:col-span-2">
            <div className="space-y-4">
              <div className="space-y-3">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15, duration: 0.45 }}
                >
                  <HeroChordGridLyricsMock />
                  <div className="p-3">
                    <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-1 text-sm">Beat & Chord Analysis & Lyrics</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300">Beat-aligned chord progressions with synced lyrics. Roman numerals and key changes with an optional Gemini key</p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25, duration: 0.45 }}
                >
                  <HeroPianoVisualizerMock />
                  <div className="p-3">
                    <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-1 text-sm">Melody & Piano</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300">Vocal and instrument notes transcribed from the song, with MIDI export</p>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Recent Videos Section - Light source in the center */}
      <section className="relative z-20 -mt-10 w-full overflow-hidden rounded-[36px] border border-divider/60 bg-[#faf6ee] py-16 shadow-[0_-24px_80px_rgba(15,23,42,0.08)] transition-colors duration-300 dark:border-white/5 dark:bg-[#050b18] min-h-[33vh]">
        {/* Background Gradient */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {theme === 'dark' ? (
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.12) 0%, transparent 60%)` }} />
          ) : (
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, rgba(255, 235, 59, 0.2) 0%, transparent 70%)` }} />
          )}
        </div>
        
        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Recently Analyzed
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Pick up where you left off, or open a song that has already been analyzed
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <RecentVideos />
          </motion.div>
        </div>
      </section>

      {/* Features Section - Tab-based design */}
      <FeaturesTabSection />
    </div>

  );
}

export default function NewHomePageContent() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-dark-bg" />}>
      <NewHomePageContentInner />
    </Suspense>
  );
}
