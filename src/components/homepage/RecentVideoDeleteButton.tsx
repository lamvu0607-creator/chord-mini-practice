'use client';

import { useState } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger, addToast } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { HiOutlineTrash } from 'react-icons/hi2';
import { queryKeys } from '@/services/query/queryKeys';

interface RecentVideoDeleteButtonProps {
  videoId: string;
  title?: string;
}

/** Admin-only control that removes a song (all of its analyses) from the shared recent list. */
export default function RecentVideoDeleteButton({ videoId, title }: RecentVideoDeleteButtonProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/transcriptions/${encodeURIComponent(videoId)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `Delete failed (${response.status})`);
      setIsOpen(false);
      addToast({ title: 'Removed from recent songs', description: title, color: 'success' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.recentVideos.all });
    } catch (error) {
      addToast({ title: 'Could not remove song', description: error instanceof Error ? error.message : String(error), color: 'danger' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Popover placement="bottom-end" isOpen={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <Button
          isIconOnly
          size="sm"
          radius="full"
          variant="flat"
          aria-label={`Remove ${title || videoId} from recent songs`}
          className={`absolute right-2 top-2 z-10 h-7 w-7 min-w-7 bg-white/90 text-gray-600 shadow-sm backdrop-blur hover:text-red-600 dark:bg-gray-900/80 dark:text-gray-300 dark:hover:text-red-400 transition-opacity md:opacity-0 md:group-hover/recent:opacity-100 md:focus-visible:opacity-100 ${isOpen ? 'md:opacity-100' : ''}`}
        >
          <HiOutlineTrash className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-64 p-3">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground">Remove this song from recent?</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            All saved analyses of this song are deleted for everyone. The cached audio is kept, so analyzing it again is quick.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="light" onPress={() => setIsOpen(false)} isDisabled={isDeleting}>Cancel</Button>
            <Button size="sm" color="danger" onPress={() => void handleDelete()} isLoading={isDeleting}>Remove</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
