'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  createStemJob,
  ensureYouTubeAudio,
  fetchStemJob,
  StemsApiError,
  uploadStemSource,
} from '@/services/stems/stemsApi';
import type { StemSet } from '@/types/stems';

export type SeparationPhase = 'idle' | 'preparing' | 'uploading' | 'queued' | 'processing' | 'done' | 'error';

export interface SeparationState {
  phase: SeparationPhase;
  /** 0..1 for uploading/processing, when known. */
  progress?: number;
  queuePosition?: number;
  title?: string;
  error?: string;
  stemSet?: StemSet;
  jobId?: string;
}

export type SeparationRequest =
  | { kind: 'youtube'; videoId: string; title?: string }
  | { kind: 'upload'; file: File };

const POLL_INTERVAL_MS = 2000;

function describe(error: unknown): string {
  if (error instanceof StemsApiError && error.status === 401) return 'Sign in to separate songs into stems.';
  return error instanceof Error ? error.message : 'Something went wrong';
}

export function useStemSeparation(onReady?: (stemSet: StemSet) => void) {
  const [state, setState] = useState<SeparationState>({ phase: 'idle' });
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  const isAuthenticated = useAuthStore((store) => store.isAuthenticated);
  const openLoginModal = useAuthStore((store) => store.openLoginModal);

  const stopPolling = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => () => {
    generation.current += 1;
    stopPolling();
  }, [stopPolling]);

  const finish = useCallback((stemSet: StemSet, run: number) => {
    if (run !== generation.current) return;
    setState({ phase: 'done', stemSet, title: stemSet.title });
    onReadyRef.current?.(stemSet);
  }, []);

  const poll = useCallback((jobId: string, run: number, title?: string) => {
    const tick = async () => {
      if (run !== generation.current) return;
      try {
        const { job, queuePosition, stemSet } = await fetchStemJob(jobId);
        if (run !== generation.current) return;
        if (job.status === 'completed' && stemSet) {
          finish(stemSet, run);
          return;
        }
        if (job.status === 'failed') {
          setState({ phase: 'error', error: job.error || 'Separation failed', jobId, title });
          return;
        }
        setState({
          phase: job.status === 'processing' ? 'processing' : 'queued',
          progress: job.progress,
          queuePosition,
          jobId,
          title,
        });
      } catch (error) {
        if (run !== generation.current) return;
        // Transient polling errors should not abort a job that keeps running server-side.
        if (!(error instanceof StemsApiError) || error.status >= 500 || error.status === 0) {
          timer.current = setTimeout(tick, POLL_INTERVAL_MS * 2);
          return;
        }
        setState({ phase: 'error', error: describe(error), jobId, title });
        return;
      }
      timer.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();
  }, [finish]);

  const start = useCallback(async (request: SeparationRequest) => {
    stopPolling();
    const run = ++generation.current;
    if (!isAuthenticated) {
      openLoginModal(false);
      setState({ phase: 'error', error: 'Sign in to separate songs into stems.' });
      return;
    }

    try {
      let response: Awaited<ReturnType<typeof createStemJob>>;
      let title: string | undefined;
      if (request.kind === 'youtube') {
        title = request.title;
        setState({ phase: 'preparing', title });
        const audio = await ensureYouTubeAudio(request.videoId, request.title);
        title = request.title || (audio.title && audio.title !== 'YouTube Video' ? audio.title : undefined);
        if (run !== generation.current) return;
        response = await createStemJob({ videoId: request.videoId, title });
      } else {
        title = request.file.name.replace(/\.[^.]+$/, '');
        setState({ phase: 'uploading', progress: 0, title });
        const uploaded = await uploadStemSource(request.file, (progress) => {
          if (run === generation.current) setState({ phase: 'uploading', progress, title });
        });
        if (run !== generation.current) return;
        if (uploaded.stemSet.status === 'ready') {
          finish(uploaded.stemSet, run);
          return;
        }
        response = await createStemJob({ sourceId: uploaded.sourceId });
      }

      if (run !== generation.current) return;
      if (response.stemSet?.status === 'ready') {
        finish(response.stemSet, run);
      } else if (response.job) {
        setState({ phase: 'queued', jobId: response.job.jobId, title });
        poll(response.job.jobId, run, title);
      }
    } catch (error) {
      if (run !== generation.current) return;
      if (error instanceof StemsApiError && error.status === 401) openLoginModal(false);
      setState({ phase: 'error', error: describe(error) });
    }
  }, [finish, isAuthenticated, openLoginModal, poll, stopPolling]);

  /** Follow a job that was already queued (e.g. after a page reload). */
  const resume = useCallback((jobId: string, title?: string) => {
    stopPolling();
    const run = ++generation.current;
    setState({ phase: 'queued', jobId, title });
    poll(jobId, run, title);
  }, [poll, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    generation.current += 1;
    setState({ phase: 'idle' });
  }, [stopPolling]);

  return { state, start, resume, reset };
}
