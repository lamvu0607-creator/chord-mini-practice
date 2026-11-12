'use client';

import React, { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from '@heroui/react';
import { FiLock, FiUser, FiEye, FiEyeOff, FiAlertTriangle } from 'react-icons/fi';
import { useAuthStore } from '@/stores/authStore';

export default function LoginModal() {
  const { isLoginModalOpen, isMandatoryLogin, closeLoginModal, login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim()) {
      setErrorMessage('Please enter your username');
      return;
    }

    if (!pin.trim() || pin.trim().length < 4 || pin.trim().length > 8) {
      setErrorMessage('PIN must be 4 to 8 digits');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(username, pin);
      if (!result.success) {
        setErrorMessage(result.error || 'Sign-in failed');
      } else {
        setUsername('');
        setPin('');
        setErrorMessage(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isMandatoryLogin) return;
    setErrorMessage(null);
    closeLoginModal();
  };

  return (
    <Modal
      isOpen={isLoginModalOpen}
      onClose={handleClose}
      isDismissable={!isMandatoryLogin}
      hideCloseButton={isMandatoryLogin}
      placement="center"
      backdrop="blur"
      classNames={{
        base: 'bg-content1 dark:bg-zinc-900 border border-divider shadow-2xl rounded-2xl max-w-md mx-4',
        header: 'border-b border-divider py-4 px-6',
        body: 'py-6 px-6',
        footer: 'border-t border-divider py-3 px-6',
      }}
    >
      <ModalContent>
        {() => (
          <form onSubmit={handleSubmit}>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <FiLock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {isMandatoryLogin ? 'Sign-in required' : 'Sign in to Chord Overlord'}
                  </h3>
                  <p className="text-xs text-default-500 font-normal">
                    {isMandatoryLogin ? 'Anonymous trial used up' : 'Use the username and PIN you were given'}
                  </p>
                </div>
              </div>
            </ModalHeader>

            <ModalBody className="flex flex-col gap-4">
              {isMandatoryLogin && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2.5 leading-relaxed">
                  <FiAlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <strong className="font-semibold block mb-0.5 text-sm text-amber-700 dark:text-amber-300">
                      You have used your 1 free trial!
                    </strong>
                    <span>
                      Sign in with the username and PIN you were given to keep analyzing this song and use every feature without limits.
                    </span>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl bg-danger-50 dark:bg-danger-950/40 border border-danger-200 dark:border-danger-800 text-danger text-sm flex items-center gap-2">
                  <span className="text-base font-bold">⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <Input
                autoFocus
                label="Username"
                placeholder="Enter your username"
                variant="bordered"
                value={username}
                onValueChange={(val) => {
                  setUsername(val);
                  setErrorMessage(null);
                }}
                startContent={<FiUser className="text-default-400" />}
                isRequired
              />

              <Input
                label="PIN"
                placeholder="4 to 8 digits"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                variant="bordered"
                value={pin}
                onValueChange={(val) => {
                  setPin(val);
                  setErrorMessage(null);
                }}
                startContent={<FiLock className="text-default-400" />}
                endContent={
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="focus:outline-none text-default-400 hover:text-default-600 p-1"
                    tabIndex={-1}
                  >
                    {showPin ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                  </button>
                }
                isRequired
              />

              <div className="text-xs text-default-400 italic">
                💡 Private instance for a small group. If you don&apos;t have a PIN yet, contact the admin.
              </div>
            </ModalBody>

            <ModalFooter>
              {!isMandatoryLogin && (
                <Button variant="light" onPress={handleClose} disabled={isSubmitting}>
                  Close
                </Button>
              )}
              <Button color="primary" type="submit" isLoading={isSubmitting} className="font-semibold flex-1">
                Sign in
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
