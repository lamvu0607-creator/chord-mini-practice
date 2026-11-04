'use client';

import { useViewportSnapshot } from './useViewportSnapshot';

/** True below the 768px phone breakpoint. Always false during server rendering. */
export function useIsMobile(): boolean {
  return useViewportSnapshot().isMobile;
}
