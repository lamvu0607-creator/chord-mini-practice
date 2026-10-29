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
import { FiKey, FiLock, FiCheckCircle } from 'react-icons/fi';
import { useAuthStore } from '@/stores/authStore';

export default function ChangePinModal() {
  const { isChangePinModalOpen, closeChangePinModal } = useAuthStore();
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setOldPin('');
    setNewPin('');
    setConfirmPin('');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleClose = () => {
    resetForm();
    closeChangePinModal();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!oldPin.trim() || oldPin.trim().length < 4 || oldPin.trim().length > 8) {
      setErrorMessage('Mã PIN hiện tại phải từ 4 đến 8 chữ số');
      return;
    }

    if (!newPin.trim() || newPin.trim().length < 4 || newPin.trim().length > 8) {
      setErrorMessage('Mã PIN mới phải từ 4 đến 8 chữ số');
      return;
    }

    if (oldPin.trim() === newPin.trim()) {
      setErrorMessage('Mã PIN mới không được trùng với mã PIN hiện tại');
      return;
    }

    if (newPin.trim() !== confirmPin.trim()) {
      setErrorMessage('Mã PIN xác nhận không khớp với mã PIN mới');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPin: oldPin.trim(),
          newPin: newPin.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Đổi mã PIN thất bại');
        return;
      }

      setSuccessMessage('Đổi mã PIN thành công! Hãy ghi nhớ mã PIN mới của bạn.');
      setTimeout(() => {
        handleClose();
      }, 1800);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isChangePinModalOpen}
      onClose={handleClose}
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
            <ModalHeader className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <FiKey className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Đổi mã PIN</h3>
                <p className="text-xs text-default-500 font-normal">Cập nhật mã PIN đăng nhập của bạn</p>
              </div>
            </ModalHeader>

            <ModalBody className="flex flex-col gap-4">
              {successMessage && (
                <div className="p-3.5 rounded-xl bg-success-50 dark:bg-success-950/40 border border-success-200 dark:border-success-800 text-success text-sm flex items-center gap-2.5">
                  <FiCheckCircle className="w-5 h-5 text-success shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl bg-danger-50 dark:bg-danger-950/40 border border-danger-200 dark:border-danger-800 text-danger text-sm flex items-center gap-2">
                  <span className="text-base font-bold">⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <Input
                label="Mã PIN hiện tại"
                placeholder="Nhập PIN đang dùng (4 - 8 số)"
                type="password"
                inputMode="numeric"
                variant="bordered"
                value={oldPin}
                onValueChange={(val) => {
                  setOldPin(val);
                  setErrorMessage(null);
                }}
                startContent={<FiLock className="text-default-400" />}
                isRequired
                disabled={Boolean(successMessage)}
              />

              <Input
                label="Mã PIN mới"
                placeholder="4 - 8 chữ số"
                type="password"
                inputMode="numeric"
                variant="bordered"
                value={newPin}
                onValueChange={(val) => {
                  setNewPin(val);
                  setErrorMessage(null);
                }}
                startContent={<FiKey className="text-default-400" />}
                isRequired
                disabled={Boolean(successMessage)}
              />

              <Input
                label="Xác nhận mã PIN mới"
                placeholder="Nhập lại mã PIN mới"
                type="password"
                inputMode="numeric"
                variant="bordered"
                value={confirmPin}
                onValueChange={(val) => {
                  setConfirmPin(val);
                  setErrorMessage(null);
                }}
                startContent={<FiKey className="text-default-400" />}
                isRequired
                disabled={Boolean(successMessage)}
              />

              <p className="text-xs text-default-400 italic">
                🔒 Sau khi đổi mã PIN, bạn có thể tiếp tục sử dụng phiên hiện tại bình thường.
              </p>
            </ModalBody>

            <ModalFooter>
              <Button variant="light" onPress={handleClose} disabled={isSubmitting}>
                Đóng
              </Button>
              <Button color="primary" type="submit" isLoading={isSubmitting} disabled={Boolean(successMessage)} className="font-semibold">
                Xác nhận đổi PIN
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
