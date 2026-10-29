import { useEffect, useState } from 'react';

export function usePersistenceReadiness() {
  const [persistenceReady, setPersistenceReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const response = await fetch('/api/persistence/health', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ready) throw new Error(payload.error || 'Persistence unavailable');
        if (!cancelled) setPersistenceReady(true);
      } catch {
        if (!cancelled) { setPersistenceReady(false); timer = setTimeout(check, 2000); }
      }
    };
    void check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);
  return { persistenceReady };
}
