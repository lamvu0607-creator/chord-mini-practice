import type { Metadata } from 'next';
import Navigation from '@/components/common/Navigation';
import RecentVideos from '@/components/homepage/RecentVideos';
import PageBackdrop from '@/components/ui/PageBackdrop';

export const metadata: Metadata = {
  title: 'Songs',
  description: 'Songs that have already been analyzed.',
};

export default function SongsPage() {
  return (
    <div className="relative flex min-h-screen flex-col transition-colors duration-300">
      <PageBackdrop />
      <Navigation overlay />
      <main className="relative z-10 container mx-auto max-w-6xl flex-grow px-4 pt-20 pb-6 sm:px-6 md:pt-24">
        <RecentVideos fullPage />
      </main>
    </div>
  );
}
