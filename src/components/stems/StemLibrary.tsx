'use client';

import React from 'react';
import Image from 'next/image';
import { Button, Spinner, Tooltip } from '@heroui/react';
import { HiOutlineTrash } from 'react-icons/hi2';
import type { StemSet } from '@/types/stems';
import { formatTime } from './stemColors';

interface StemLibraryProps {
  stemSets: StemSet[];
  loading: boolean;
  activeSourceId?: string | null;
  onOpen: (stemSet: StemSet) => void;
  onDelete: (stemSet: StemSet) => void;
}

const StemLibrary: React.FC<StemLibraryProps> = ({ stemSets, loading, activeSourceId, onOpen, onDelete }) => (
  <div className="rounded-xl border border-divider bg-content1/90 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06]">
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Separated songs</h2>
    {loading ? (
      <div className="flex justify-center py-4"><Spinner size="sm" /></div>
    ) : stemSets.length === 0 ? (
      <p className="text-sm text-gray-500 dark:text-gray-400">Nothing yet. Split a song and it will show up here.</p>
    ) : (
      <ul className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto">
        {stemSets.map((stemSet) => (
          <li key={stemSet.sourceId} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpen(stemSet)}
              className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/60 ${
                activeSourceId === stemSet.sourceId ? 'bg-blue-50 ring-1 ring-blue-300 dark:bg-blue-500/10 dark:ring-blue-500/40' : ''
              }`}
            >
              {stemSet.videoId ? (
                <Image
                  src={`https://img.youtube.com/vi/${stemSet.videoId}/mqdefault.jpg`}
                  alt=""
                  width={64}
                  height={36}
                  unoptimized
                  className="h-9 w-16 flex-shrink-0 rounded object-cover"
                />
              ) : (
                <span className="flex h-9 w-16 flex-shrink-0 items-center justify-center rounded bg-gray-200 text-[10px] font-semibold uppercase text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  Upload
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                  {stemSet.title || stemSet.videoId || 'Untitled'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {stemSet.duration ? formatTime(stemSet.duration) : ''}{stemSet.sourceType === 'upload' ? ' · private' : ''}
                </span>
              </span>
            </button>
            {stemSet.canDelete && (
              <Tooltip content="Delete stems" delay={400}>
                <Button isIconOnly size="sm" variant="light" className="max-md:h-11 max-md:w-11" aria-label="Delete stems" onPress={() => onDelete(stemSet)}>
                  <HiOutlineTrash className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default StemLibrary;
