'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { IconType } from 'react-icons';
import {
  HiOutlineAdjustmentsVertical,
  HiOutlineCog6Tooth,
  HiOutlineMusicalNote,
  HiOutlinePlusCircle,
} from 'react-icons/hi2';

const TABS: Array<{ href: string; label: string; Icon: IconType }> = [
  { href: '/songs', label: 'Songs', Icon: HiOutlineMusicalNote },
  { href: '/analyze', label: 'Add', Icon: HiOutlinePlusCircle },
  { href: '/stems', label: 'Stems', Icon: HiOutlineAdjustmentsVertical },
  { href: '/settings', label: 'Settings', Icon: HiOutlineCog6Tooth },
];

const BAR_HEIGHT = 'calc(3.5rem + env(safe-area-inset-bottom, 0px))';

/** A song page has its own controls at the bottom of the screen. */
const isSongPage = (pathname: string | null) => /^\/analyze\/[^/]+/.test(pathname ?? '');

/** Bottom navigation on phones. Hidden from 768px up with CSS, so server and client markup match. */
export default function MobileTabBar() {
  const pathname = usePathname();
  if (isSongPage(pathname)) return null;

  return (
    <>
      <div aria-hidden className="md:hidden" style={{ height: BAR_HEIGHT }} />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-[90] border-t border-divider bg-white/95 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/95 md:hidden"
        style={{ height: BAR_HEIGHT, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <ul className="grid h-14 grid-cols-4">
          {TABS.map(({ href, label, Icon }) => {
            const isActive = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
