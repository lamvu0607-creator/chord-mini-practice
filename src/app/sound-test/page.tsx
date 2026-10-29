import type { Metadata } from 'next';
import SoundTestClient from '@/app/sound-test/SoundTestClient';

export const metadata: Metadata = {
  title: 'Sound Test',
  robots: { index: false, follow: false },
};

export default function SoundTestPage() {
  return <SoundTestClient />;
}
