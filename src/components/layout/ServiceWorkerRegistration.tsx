'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js, which only shows /offline.html when the server cannot be reached.
 * Production only, so development never serves a stale worker.
 */
const ServiceWorkerRegistration: React.FC = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return undefined;

    // Wait a moment so registration never competes with the first page load.
    const timer = setTimeout(() => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((error: unknown) => console.warn('Service worker registration failed:', error));
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return null;
};

export default ServiceWorkerRegistration;
