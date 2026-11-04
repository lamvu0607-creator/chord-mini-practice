'use client';

import { usePathname } from 'next/navigation';
import Footer from '@/components/common/Footer';

const APP_SCREENS = new Set(['/songs', '/analyze', '/stems', '/settings']);

/** Screens reached from the phone tab bar behave like an app and have no footer on phones. */
export default function AppFooter() {
  const pathname = usePathname();
  if (pathname && (APP_SCREENS.has(pathname) || pathname.startsWith('/analyze/'))) {
    return <div className="hidden md:block"><Footer /></div>;
  }
  return <Footer />;
}
