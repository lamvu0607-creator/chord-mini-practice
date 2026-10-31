'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { FiInfo, FiX, FiLogIn } from 'react-icons/fi';
import { useAuthStore } from '@/stores/authStore';

export default function AnonymousTrialBanner() {
  const { isAuthenticated, trialQuota, openLoginModal } = useAuthStore();
  const [isDismissed, setIsDismissed] = useState(false);

  // Do not show if user is logged in, or banner dismissed, or quota not loaded yet
  if (isAuthenticated || isDismissed || !trialQuota) {
    return null;
  }

  // Show only if this anonymous session is using or has consumed their 1 trial
  if (trialQuota.used === 0 && trialQuota.remaining > 0) {
    return null;
  }

  return (
    <div className="relative z-40 w-full bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 border-y border-amber-500/20 backdrop-blur-md px-4 py-2 text-xs sm:text-sm text-amber-800 dark:text-amber-200 transition-all duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <FiInfo className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="truncate sm:whitespace-normal">
            You are using your <strong>single free trial song (1/1)</strong>. Sign in to keep analyzing without limits and save your song history!
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            color="warning"
            variant="flat"
            className="font-semibold text-xs h-7 px-3"
            startContent={<FiLogIn className="w-3.5 h-3.5" />}
            onPress={() => openLoginModal(false)}
          >
            Sign in
          </Button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="text-amber-600/70 dark:text-amber-400/70 hover:text-amber-800 dark:hover:text-amber-200 p-1 rounded-md transition-colors"
            aria-label="Dismiss notice"
          >
            <FiX className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
