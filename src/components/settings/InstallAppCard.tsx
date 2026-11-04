'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Button, Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';
import { HiOutlineArrowDownTray, HiOutlineCheckCircle } from 'react-icons/hi2';
import { useInstallPrompt, type InstallPlatform } from '@/components/layout/InstallPrompt';

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-5 w-5 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="Share">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11H5v9h14v-9h-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEPS: Record<Exclude<InstallPlatform, 'prompt'>, { title: string; steps: React.ReactNode[] }> = {
  'ios-safari': {
    title: 'Install on iPhone or iPad',
    steps: [
      <>Tap <ShareIcon /> <strong>Share</strong> in the Safari toolbar.</>,
      <>Scroll down and tap <strong>Add to Home Screen</strong>.</>,
      <>Tap <strong>Add</strong>. ChordMini appears on your home screen.</>,
    ],
  },
  'ios-other': {
    title: 'Open this page in Safari',
    steps: [
      <>On iPhone and iPad only <strong>Safari</strong> can install apps from the web.</>,
      <>Copy this page&apos;s address and open it in Safari.</>,
      <>Tap <ShareIcon /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</>,
    ],
  },
  manual: {
    title: 'Install from the browser menu',
    steps: [
      <>Open the browser menu (<strong>⋮</strong> in Chrome or Edge).</>,
      <>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</>,
      <>If neither is there, reload the page once and look again. Firefox on a computer cannot install web apps.</>,
    ],
  },
};

/** Install ChordMini to the home screen: the browser's own dialog where there is one, steps otherwise. */
export default function InstallAppCard() {
  const { ready, isInstalled, platform, promptInstall } = useInstallPrompt();
  const [showSteps, setShowSteps] = useState(false);

  if (!ready) return null;

  const instructions = platform === 'prompt' ? null : STEPS[platform];

  return (
    <section className="mb-6 flex items-center gap-4 rounded-xl border border-gray-200 bg-content1 p-4 dark:border-gray-700">
      <Image src="/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 flex-shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-foreground">ChordMini app</h2>
        <p className="text-sm text-default-500">
          {isInstalled
            ? 'Installed. Open it from your home screen.'
            : 'Add ChordMini to your home screen and open it like an app.'}
        </p>
      </div>
      {isInstalled ? (
        <HiOutlineCheckCircle className="h-7 w-7 flex-shrink-0 text-success" aria-label="Installed" />
      ) : (
        <Button
          color="primary"
          className="min-h-11 flex-shrink-0"
          startContent={<HiOutlineArrowDownTray className="h-5 w-5" />}
          onPress={() => {
            if (platform === 'prompt') void promptInstall();
            else setShowSteps(true);
          }}
        >
          Install app
        </Button>
      )}

      {instructions && (
        <Modal isOpen={showSteps} onClose={() => setShowSteps(false)} placement="center" classNames={{ base: 'mx-4' }}>
          <ModalContent>
            <ModalHeader>{instructions.title}</ModalHeader>
            <ModalBody className="pb-6">
              <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-foreground">
                {instructions.steps.map((step, index) => <li key={index}>{step}</li>)}
              </ol>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </section>
  );
}
