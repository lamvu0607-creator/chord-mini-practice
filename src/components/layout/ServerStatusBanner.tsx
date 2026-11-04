'use client';

import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 60_000;
const RECHECK_AFTER_FAILURE_MS = 15_000;
const REQUEST_TIMEOUT_MS = 12_000;
/** One slow or failed check is not enough: the backend can be busy with a long job. */
const FAILURES_BEFORE_NOTICE = 2;

export const SERVER_OFF_MESSAGE = 'The ChordMini server is off right now. Please contact Lâm Vũ.';

type CheckResult = 'up' | 'down' | 'unknown';

async function checkBackend(): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
    if (response.ok) return 'up';
    // 429 and 503 are nginx's rate limit, not a server that is off.
    return response.status === 429 || response.status === 503 ? 'unknown' : 'down';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shown when the analysis server does not answer while the website itself still loads.
 * When the whole machine is off, the service worker shows /offline.html instead.
 */
export default function ServerStatusBanner() {
  const [isDown, setIsDown] = useState(false);

  useEffect(() => {
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const check = async () => {
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(check, CHECK_EVERY_MS);
        return;
      }
      const result = await checkBackend();
      if (stopped) return;
      if (result === 'up') failures = 0;
      if (result === 'down') failures += 1;
      setIsDown(failures >= FAILURES_BEFORE_NOTICE);
      timer = setTimeout(check, result === 'up' ? CHECK_EVERY_MS : RECHECK_AFTER_FAILURE_MS);
    };

    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      void check();
    };

    void check();
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, []);

  if (!isDown) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[200] bg-red-600 px-4 py-2 text-center text-sm font-medium text-white shadow-lg"
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
    >
      {SERVER_OFF_MESSAGE}
    </div>
  );
}
