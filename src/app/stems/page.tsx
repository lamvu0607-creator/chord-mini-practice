import { Suspense } from 'react';
import type { Metadata } from 'next';
import StemsPageClient from './StemsPageClient';

export const metadata: Metadata = {
  title: 'Split Stems',
  description: 'Separate songs into vocals, drums, bass and other with SCNet.',
};

export default function StemsPage() {
  return (
    <Suspense fallback={null}>
      <StemsPageClient />
    </Suspense>
  );
}
