"use client";

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Progress, Tab, Tabs } from '@heroui/react';
import { HiOutlineArrowUpTray, HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import Navigation from '@/components/common/Navigation';
import PageBackdrop from '@/components/ui/PageBackdrop';
import { ANALYZE_UPLOAD_ACCEPT, ANALYZE_UPLOAD_MAX_MB, uploadAnalyzeAudio } from '@/services/audio/analyzeUploadApi';
import { useAuthStore } from '@/stores/authStore';
import { buildAnalyzePageUrl } from '@/utils/analyzeRouteUtils';
import IntegratedSearchContainer from '@/components/homepage/IntegratedSearchContainer';
import { useSharedSearchState } from '@/hooks/search/useSharedSearchState';

/**
 * Source picker for the single analyze page: YouTube search (or a pasted link) opens /analyze/<videoId>,
 * an uploaded file is stored and opens /analyze/upload_<id>. Cutting a section happens
 * on that page (✂️ "Trim a section").
 */
export default function AnalyzeSourcePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const openLoginModal = useAuthStore((state) => state.openLoginModal);
  const [tab, setTab] = useState<string>('youtube');
  const [searchInputError, setSearchInputError] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isUploading = uploadProgress !== null;

  const {
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    updateSearchQuery,
    handleSearch,
    handleVideoSelect,
    setSearchError,
  } = useSharedSearchState();

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    if (file.size > ANALYZE_UPLOAD_MAX_MB * 1024 * 1024) {
      setUploadError(`File is larger than ${ANALYZE_UPLOAD_MAX_MB} MB.`);
      return;
    }
    setUploadError(null);
    setUploadProgress(0);
    try {
      const uploaded = await uploadAnalyzeAudio(file, { onProgress: setUploadProgress });
      router.push(buildAnalyzePageUrl(uploaded.id, { title: uploaded.title }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
      setUploadProgress(null);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col transition-colors duration-300">
      <PageBackdrop />
      <Navigation overlay />
      <main className="relative z-10 container mx-auto max-w-3xl flex-grow px-4 pt-20 pb-6 sm:px-6 md:pt-24 md:pb-12">
        <header className="mb-4 px-1 md:mb-6">
          <h1 className="text-2xl md:text-4xl font-extrabold font-outfit text-black dark:text-white dark:drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]">Analyze Audio</h1>
          <p className="mt-2 text-sm md:mt-3 md:text-base text-default-500 dark:text-slate-200 leading-relaxed font-outfit">
            Detect chords, beats and melody from a YouTube video or your own audio file.
            On the results page, click ✂️ &quot;Trim a section&quot; to analyze only part of the song.
          </p>
        </header>

        <div className="rounded-xl border border-divider bg-content1/90 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06]">
          <Tabs
            aria-label="Audio source"
            selectedKey={tab}
            onSelectionChange={(key) => setTab(String(key))}
            variant="underlined"
            color="primary"
            classNames={{ tabList: 'gap-4 border-b border-divider w-full', panel: 'pt-4' }}
          >
            <Tab key="youtube" title={<span className="flex items-center gap-1.5"><HiOutlineMagnifyingGlass className="h-4 w-4" />YouTube</span>}>
              <IntegratedSearchContainer
                searchQuery={searchQuery}
                setSearchQuery={updateSearchQuery}
                handleSearch={handleSearch}
                isSearching={isSearching}
                searchError={searchError}
                error={searchInputError}
                setError={setSearchInputError}
                setSearchError={setSearchError}
                searchResults={searchResults}
                handleVideoSelect={handleVideoSelect}
                showUploadButton={false}
              />
            </Tab>

            <Tab key="upload" title={<span className="flex items-center gap-1.5"><HiOutlineArrowUpTray className="h-4 w-4" />Upload file</span>}>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (!isUploading) void pickFile(event.dataTransfer.files[0]);
                }}
                className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  dragging
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                    : 'border-gray-300 hover:border-blue-400 dark:border-gray-600'
                }`}
              >
                <HiOutlineArrowUpTray className="h-6 w-6 text-gray-500" />
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  <span className="md:hidden">Tap to choose an audio file</span>
                  <span className="hidden md:inline">Drag and drop an audio file here, or click to choose</span>
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  MP3, WAV, M4A, FLAC, OGG · up to {ANALYZE_UPLOAD_MAX_MB} MB · sign-in required · listed for signed-in users, and anyone with the link can open it
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={ANALYZE_UPLOAD_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  void pickFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              {isUploading && (
                <Progress
                  aria-label="Upload progress"
                  size="sm"
                  className="mt-3"
                  value={Math.round((uploadProgress ?? 0) * 100)}
                  showValueLabel
                  label="Uploading..."
                />
              )}
              {uploadError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
            </Tab>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
