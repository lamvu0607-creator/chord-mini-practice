'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Button, Modal, ModalBody, ModalContent, ModalHeader, Spinner, Tooltip, addToast } from '@heroui/react';
import { HiOutlineScissors } from 'react-icons/hi2';
import { loadSourceAudioForClip, type ClipSourceAudio } from '@/services/audio/clipSourceAudio';
import { uploadAnalyzeAudio } from '@/services/audio/analyzeUploadApi';
import { useAuthStore } from '@/stores/authStore';
import { buildAnalyzePageUrl, readAnalyzeRouteParams } from '@/utils/analyzeRouteUtils';

const AudioClipSelector = dynamic(() => import('@/components/analysis/AudioClipSelector'), { ssr: false });

interface AnalyzeClipControlProps {
  videoId: string;
  title?: string;
  /** 'icon' for the utility bar, 'button' for a labelled button in the setup card. */
  variant?: 'icon' | 'button';
  isDisabled?: boolean;
}

const tooltipClassNames = {
  content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg',
};

const buttonClassName = 'h-9 w-9 min-w-9 rounded-full shadow-md transition-colors duration-200 inline-flex items-center justify-center p-0 bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70 disabled:opacity-60';

/**
 * Cut a section of the current song (YouTube or uploaded) without leaving the page.
 * The clip is stored as a new upload and opened at /analyze/<id> with the same models.
 */
export default function AnalyzeClipControl({ videoId, title, variant = 'icon', isDisabled = false }: AnalyzeClipControlProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const openLoginModal = useAuthStore((state) => state.openLoginModal);
  const [isLoading, setIsLoading] = useState(false);
  const [source, setSource] = useState<ClipSourceAudio | null>(null);

  const handleOpen = async () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setIsLoading(true);
    try {
      setSource(await loadSourceAudioForClip(videoId, title));
    } catch (error) {
      addToast({
        title: 'Could not open the trimmer',
        description: error instanceof Error ? error.message : 'Could not load the audio.',
        color: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClipReady = async (clip: File) => {
    const clipTitle = clip.name.replace(/\.wav$/i, '');
    try {
      const uploaded = await uploadAnalyzeAudio(clip, { title: clipTitle });
      // Keep the models picked on this page for the clip.
      const current = readAnalyzeRouteParams(new URLSearchParams(window.location.search));
      setSource(null);
      router.push(buildAnalyzePageUrl(uploaded.id, {
        title: uploaded.title,
        beatModel: current.beatModel,
        chordModel: current.chordModel,
      }));
    } catch (error) {
      addToast({
        title: 'Could not save the trimmed section',
        description: error instanceof Error ? error.message : 'Upload failed.',
        color: 'danger',
      });
    }
  };

  const trigger = variant === 'button' ? (
    <Button
      size="lg"
      variant="flat"
      className="w-full md:w-auto font-medium"
      startContent={isLoading ? undefined : <HiOutlineScissors className="h-5 w-5" />}
      isLoading={isLoading}
      isDisabled={isDisabled}
      onPress={() => void handleOpen()}
    >
      Trim a section
    </Button>
  ) : (
    <Tooltip content="Trim a section to analyze on its own" placement="top" classNames={tooltipClassNames}>
      <button
        type="button"
        className={buttonClassName}
        aria-label="Trim a section to analyze"
        onClick={() => void handleOpen()}
        disabled={isLoading || isDisabled}
      >
        {isLoading ? <Spinner size="sm" /> : <HiOutlineScissors className="h-4 w-4" />}
      </button>
    </Tooltip>
  );

  return (
    <>
      {trigger}
      <Modal
        isOpen={source !== null}
        onClose={() => setSource(null)}
        placement="center"
        size="3xl"
        backdrop="blur"
        classNames={{
          base: 'bg-content1 dark:bg-zinc-900 border border-divider shadow-2xl rounded-2xl mx-4',
          header: 'border-b border-divider py-4 px-6',
          body: 'py-5 px-6',
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <HiOutlineScissors className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-foreground">Trim a section to analyze</h3>
                  <p className="truncate text-sm font-normal text-default-500">{source?.title}</p>
                </div>
              </ModalHeader>
              <ModalBody>
                {source && (
                  <AudioClipSelector
                    file={source.file}
                    sourceName={source.title}
                    confirmLabel="Trim & analyze this section"
                    onClipReady={handleClipReady}
                    onCancel={() => setSource(null)}
                  />
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
