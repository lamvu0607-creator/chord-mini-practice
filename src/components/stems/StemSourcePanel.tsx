'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Button, Input, Spinner, Tab, Tabs } from '@heroui/react';
import { HiOutlineArrowUpTray, HiOutlineLink, HiOutlineMusicalNote } from 'react-icons/hi2';
import { useRecentVideosQuery } from '@/hooks/query/useRecentVideosQuery';
import { ALL_KEYS_VALUE } from '@/services/query/recentVideos';
import { parseYouTubeVideoId } from '@/services/stems/stemsApi';
import type { SeparationRequest } from '@/hooks/stems/useStemSeparation';

interface StemSourcePanelProps {
  busy: boolean;
  onStart: (request: SeparationRequest) => void;
}

const MAX_UPLOAD_MB = 100;
const ACCEPT = '.mp3,.wav,.m4a,.flac,.ogg,.opus,.webm,.aac,audio/*';

const StemSourcePanel: React.FC<StemSourcePanelProps> = ({ busy, onStart }) => {
  const [tab, setTab] = useState<string>('youtube');
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const recent = useRecentVideosQuery({ selectedKey: ALL_KEYS_VALUE, enabled: tab === 'recent', pageSize: 24 });
  const recentVideos = recent.data?.pages.flatMap((page) => page.videos) ?? [];

  const submitLink = (event: React.FormEvent) => {
    event.preventDefault();
    const videoId = parseYouTubeVideoId(link);
    if (!videoId) {
      setLinkError('Paste a YouTube link (watch, youtu.be or shorts) or an 11-character video id.');
      return;
    }
    setLinkError(null);
    onStart({ kind: 'youtube', videoId });
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`File is larger than ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setUploadError(null);
    onStart({ kind: 'upload', file });
  };

  return (
    <div className="rounded-xl border border-divider bg-content1/90 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06]">
      <Tabs
        aria-label="Audio source"
        selectedKey={tab}
        onSelectionChange={(key) => setTab(String(key))}
        variant="underlined"
        color="primary"
        classNames={{ tabList: 'gap-4 border-b border-divider w-full', panel: 'pt-4' }}
      >
        <Tab key="youtube" title={<span className="flex items-center gap-1.5"><HiOutlineLink className="h-4 w-4" />YouTube link</span>}>
          <form onSubmit={submitLink} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Input
              aria-label="YouTube link"
              placeholder="https://www.youtube.com/watch?v=…"
              value={link}
              onValueChange={setLink}
              isInvalid={Boolean(linkError)}
              errorMessage={linkError ?? undefined}
              isDisabled={busy}
              className="flex-1"
            />
            <Button type="submit" color="primary" isDisabled={busy || !link.trim()}>Split stems</Button>
          </form>
        </Tab>

        <Tab key="upload" title={<span className="flex items-center gap-1.5"><HiOutlineArrowUpTray className="h-4 w-4" />Upload file</span>}>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!busy) pickFile(event.dataTransfer.files[0]);
            }}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              dragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                : 'border-gray-300 hover:border-blue-400 dark:border-gray-600'
            }`}
          >
            <HiOutlineArrowUpTray className="h-6 w-6 text-gray-500" />
            <span className="font-medium text-gray-700 dark:text-gray-200">Drop an audio file here, or click to choose</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">MP3, WAV, M4A, FLAC, OGG · up to {MAX_UPLOAD_MB} MB · only you can see your uploads</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {uploadError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
        </Tab>

        <Tab key="recent" title={<span className="flex items-center gap-1.5"><HiOutlineMusicalNote className="h-4 w-4" />Analyzed songs</span>}>
          {recent.isLoading ? (
            <div className="flex justify-center py-6"><Spinner size="sm" /></div>
          ) : recentVideos.length === 0 ? (
            <p className="py-4 text-sm text-gray-500 dark:text-gray-400">No analyzed songs yet.</p>
          ) : (
            <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {recentVideos.map((video) => (
                <button
                  key={video.videoId}
                  type="button"
                  disabled={busy}
                  onClick={() => onStart({ kind: 'youtube', videoId: video.videoId, title: video.title })}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/60 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-blue-500/10"
                >
                  <Image
                    src={video.thumbnailUrl || `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                    alt=""
                    width={80}
                    height={45}
                    unoptimized
                    className="h-[45px] w-20 flex-shrink-0 rounded object-cover"
                  />
                  <span className="line-clamp-2 text-sm text-gray-800 dark:text-gray-100">{video.title || video.videoId}</span>
                </button>
              ))}
            </div>
          )}
          {recent.hasNextPage && (
            <Button size="sm" variant="light" className="mt-2" isLoading={recent.isFetchingNextPage} onPress={() => void recent.fetchNextPage()}>
              Load more
            </Button>
          )}
        </Tab>
      </Tabs>
    </div>
  );
};

export default StemSourcePanel;
