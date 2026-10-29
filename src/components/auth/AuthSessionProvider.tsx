'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import LoginModal from './LoginModal';
import ChangePinModal from './ChangePinModal';
import AdminUserModal from './AdminUserModal';

export default function AuthSessionProvider({ children }: { children?: React.ReactNode }) {
  const checkSession = useAuthStore((state) => state.checkSession);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <>
      {children}
      <LoginModal />
      <ChangePinModal />
      <AdminUserModal />
    </>
  );
}
