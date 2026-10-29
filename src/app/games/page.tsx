'use client';

import React from 'react';
import Navigation from '@/components/common/Navigation';
import PageBackdrop from '@/components/ui/PageBackdrop';
import MiniGamesContainer from '@/components/games/MiniGamesContainer';

export default function GamesPage() {
  return (
    <div className="relative flex flex-col min-h-screen transition-colors duration-300">
      <PageBackdrop />

      {/* Navigation */}
      <Navigation overlay />

      {/* Main Content Area */}
      <main className="relative z-10 container mx-auto px-6 pt-24 pb-12 flex-grow flex flex-col justify-center max-w-6xl">
        <div className="mb-6 px-1">
          <h1 className="text-3xl md:text-4xl font-extrabold font-outfit text-black dark:text-white dark:drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]">
            Interactive Music Theory & Games
          </h1>
          <p className="mt-3 text-base md:text-lg text-default-500 dark:text-slate-200 leading-relaxed font-outfit">
            Test your music skills, read fretboard charts, practice interval/progression ear training, or challenge yourself to a quick X/O match.
          </p>
          <p className="mt-2 text-base text-default-450 dark:text-slate-300 font-outfit">
            All gameplay session results are recorded dynamically in your browser session history.
          </p>
        </div>

        {/* Reusable games container in standalone mode */}
        <MiniGamesContainer layoutMode="standalone" />
      </main>
    </div>
  );
}
