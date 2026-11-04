'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HiChevronLeft } from 'react-icons/hi2';
import { Button, addToast } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Navigation from '@/components/common/Navigation';
import StemLibrary from '@/components/stems/StemLibrary';
import StemPlayer from '@/components/stems/StemPlayer';
import StemSeparationStatus from '@/components/stems/StemSeparationStatus';
import StemSourcePanel from '@/components/stems/StemSourcePanel';
import PageBackdrop from '@/components/ui/PageBackdrop';
import { formatTime } from '@/components/stems/stemColors';
import { useStemSeparation } from '@/hooks/stems/useStemSeparation';
import { deleteStemSet, fetchStemSet, fetchStemSets } from '@/services/stems/stemsApi';
import { useAuthStore } from '@/stores/authStore';
import type { StemSet } from '@/types/stems';

const LIBRARY_QUERY_KEY = ['stems', 'library'] as const;

export default function StemsPageClient() {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get('id');
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((store) => store.isAuthenticated);
  const authLoading = useAuthStore((store) => store.isLoading);
  const openLoginModal = useAuthStore((store) => store.openLoginModal);
  const [active, setActive] = useState<StemSet | null>(null);
  const activeSourceId = active?.sourceId;

  const library = useQuery({ queryKey: LIBRARY_QUERY_KEY, queryFn: fetchStemSets, staleTime: 30_000 });

  // The id this page has already acted on. Opening a set locally marks its id as handled before
  // the URL catches up, so the deep-link effect below cannot reload the previous set over it.
  const handledId = useRef<string | null>(null);

  const openSet = useCallback((stemSet: StemSet) => {
    handledId.current = stemSet.sourceId;
    setActive(stemSet);
    // Native history updates are synced into useSearchParams without a server round trip.
    window.history.replaceState(null, '', `/stems?id=${encodeURIComponent(stemSet.sourceId)}`);
  }, []);

  const separation = useStemSeparation((stemSet) => {
    openSet(stemSet);
    void queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
  });
  const { resume } = separation;
  const busy = ['preparing', 'uploading', 'queued', 'processing'].includes(separation.state.phase);

  // Deep link: /stems?id=<sourceId> opens a finished set or follows its running job.
  useEffect(() => {
    if (!requestedId || handledId.current === requestedId) return;
    handledId.current = requestedId;
    let cancelled = false;
    fetchStemSet(requestedId)
      .then(({ stemSet, activeJobId }) => {
        if (cancelled) return;
        if (stemSet.status === 'ready') setActive(stemSet);
        else if (activeJobId) resume(activeJobId, stemSet.title);
      })
      .catch(() => {
        if (!cancelled) addToast({ title: 'Stems not found', description: 'They may have expired or be private.', color: 'warning' });
      });
    return () => { cancelled = true; };
  }, [requestedId, resume]);

  const closeSet = useCallback(() => {
    setActive(null);
    handledId.current = null;
    window.history.replaceState(null, '', '/stems');
  }, []);

  const handleDelete = useCallback(async (stemSet: StemSet) => {
    if (!window.confirm(`Delete the stems for "${stemSet.title || stemSet.sourceId}"?`)) return;
    try {
      await deleteStemSet(stemSet.sourceId);
      if (activeSourceId === stemSet.sourceId) {
        setActive(null);
        window.history.replaceState(null, '', '/stems');
      }
      void queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
    } catch (error) {
      addToast({ title: 'Delete failed', description: error instanceof Error ? error.message : String(error), color: 'danger' });
    }
  }, [activeSourceId, queryClient]);

  return (
    <div className="relative flex min-h-screen flex-col transition-colors duration-300">
      <PageBackdrop />
      <Navigation overlay />
      <main className="relative z-10 container mx-auto max-w-6xl flex-grow px-4 pt-20 pb-6 md:px-6 md:pt-24 md:pb-12">
        {/* On phones an open song takes the page; the list comes back with the back button. */}
        <header className={`mb-4 px-1 md:mb-6 ${active ? 'max-md:hidden' : ''}`}>
          <h1 className="text-2xl md:text-4xl font-extrabold font-outfit text-black dark:text-white dark:drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]">Split Stems</h1>
          <p className="mt-3 hidden text-base text-default-500 md:block dark:text-slate-200 leading-relaxed font-outfit">
            Separate a song into vocals, drums, bass and other with SCNet, then mix, solo and download each part.
          </p>
        </header>

        {!authLoading && !isAuthenticated && (
          <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border ${active ? 'max-md:hidden' : ''} border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`}>
            <span>Sign in to split new songs. Songs already separated from YouTube can be played by anyone.</span>
            <Button size="sm" color="warning" variant="flat" onPress={() => openLoginModal(false)}>Sign in</Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="flex min-w-0 flex-col gap-4">
            <div className={active ? 'max-md:hidden' : ''}>
              <StemSourcePanel busy={busy} onStart={(request) => void separation.start(request)} />
            </div>
            <StemSeparationStatus state={separation.state} onDismiss={separation.reset} />

            {active && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={closeSet}
                  className="-ml-2 flex min-h-11 items-center gap-1 self-start pr-3 text-sm font-medium text-blue-600 dark:text-blue-400 md:hidden"
                >
                  <HiChevronLeft className="h-5 w-5" aria-hidden />
                  All stems
                </button>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="min-w-0 truncate text-xl font-semibold text-foreground">
                    {active.title || active.videoId || 'Uploaded song'}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {active.duration ? <span>{formatTime(active.duration)}</span> : null}
                    {active.model ? <span>{active.model}</span> : null}
                    {active.videoId ? (
                      <Link href={`/analyze/${active.videoId}`} className="inline-flex min-h-11 items-center text-blue-600 md:min-h-0 hover:underline dark:text-blue-400">
                        Open in analyzer →
                      </Link>
                    ) : null}
                  </div>
                </div>
                <StemPlayer key={active.sourceId} stemSet={active} />
              </div>
            )}
          </section>

          {/* Phones: the separated songs come before the form for adding a new one. */}
          <aside className={active ? 'max-md:hidden' : 'max-md:order-first'}>
            <StemLibrary
              stemSets={library.data?.stemSets ?? []}
              loading={library.isLoading}
              activeSourceId={activeSourceId}
              onOpen={openSet}
              onDelete={(stemSet) => void handleDelete(stemSet)}
            />
            <p className="mt-3 px-1 text-xs text-default-500 dark:text-slate-300">
              Models trained on MUSDB18-HQ; for personal practice and non-commercial use.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
