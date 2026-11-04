'use client';

import { useEffect, useSyncExternalStore } from 'react';

/** Chromium's install event; not in the DOM typings. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Mounted once in the root layout. Chrome fires `beforeinstallprompt` soon after the first page
 * loads, usually before the user opens Settings, so the event is kept here until it is needed.
 */
export function InstallPromptCapture() {
  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
      notify();
    };
    const handleInstalled = () => {
      installed = true;
      deferredPrompt = null;
      notify();
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);
  return null;
}

export type InstallPlatform = 'prompt' | 'ios-safari' | 'ios-other' | 'manual';

function isRunningInstalled() {
  if (installed) return true;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  return Boolean(standalone || (navigator as Navigator & { standalone?: boolean }).standalone);
}

function getPlatform(): InstallPlatform {
  if (deferredPrompt) return 'prompt';
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIos) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? 'ios-other' : 'ios-safari';
  return 'manual';
}

/** What the install button can do in this browser. `null` while rendering on the server. */
export function useInstallPrompt() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${isRunningInstalled() ? 'installed' : 'not'}|${getPlatform()}`,
    () => null,
  );

  const promptInstall = async (): Promise<boolean> => {
    const event = deferredPrompt;
    if (!event) return false;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // Chrome allows one prompt per event; it fires a new event if the user can still install.
    deferredPrompt = null;
    notify();
    return outcome === 'accepted';
  };

  if (!snapshot) return { ready: false as const, isInstalled: false, platform: 'manual' as InstallPlatform, promptInstall };
  const [state, platform] = snapshot.split('|');
  return { ready: true as const, isInstalled: state === 'installed', platform: platform as InstallPlatform, promptInstall };
}
