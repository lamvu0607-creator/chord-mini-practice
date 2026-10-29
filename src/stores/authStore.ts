import { create } from 'zustand';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
}

export interface TrialQuota {
  remaining: number;
  used: number;
  isQuotaExceeded: boolean;
  trialVideoId: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoginModalOpen: boolean;
  isMandatoryLogin: boolean;
  isChangePinModalOpen: boolean;
  isAdminUsersModalOpen: boolean;
  trialQuota: TrialQuota | null;

  // Actions
  setUser: (user: AuthUser | null) => void;
  openLoginModal: (mandatory?: boolean) => void;
  closeLoginModal: () => void;
  setMandatoryLogin: (mandatory: boolean) => void;
  openChangePinModal: () => void;
  closeChangePinModal: () => void;
  openAdminUsersModal: () => void;
  closeAdminUsersModal: () => void;
  checkSession: () => Promise<boolean>;
  fetchQuotaStatus: () => Promise<TrialQuota | null>;
  login: (username: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isLoginModalOpen: false,
  isMandatoryLogin: false,
  isChangePinModalOpen: false,
  isAdminUsersModalOpen: false,
  trialQuota: null,

  setUser: (user) => set({
    user,
    isAuthenticated: Boolean(user),
    isLoading: false,
  }),

  openLoginModal: (mandatory = false) => set({
    isLoginModalOpen: true,
    isMandatoryLogin: mandatory,
  }),

  closeLoginModal: () => set((state) => {
    if (state.isMandatoryLogin) return state;
    return { isLoginModalOpen: false };
  }),

  setMandatoryLogin: (mandatory: boolean) => set({
    isMandatoryLogin: mandatory,
    isLoginModalOpen: mandatory ? true : get().isLoginModalOpen,
  }),

  openChangePinModal: () => set({ isChangePinModalOpen: true }),
  closeChangePinModal: () => set({ isChangePinModalOpen: false }),

  openAdminUsersModal: () => set({ isAdminUsersModalOpen: true }),
  closeAdminUsersModal: () => set({ isAdminUsersModalOpen: false }),

  fetchQuotaStatus: async () => {
    try {
      const response = await fetch('/api/auth/quota', {
        method: 'GET',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const body = await response.json();
      if (body.success && body.data) {
        const quota: TrialQuota = {
          remaining: body.data.remainingTrials,
          used: body.data.usedCount,
          isQuotaExceeded: body.data.isQuotaExceeded,
          trialVideoId: body.data.trialVideoId,
        };
        set({ trialQuota: quota });
        if (quota.isQuotaExceeded && !get().isAuthenticated) {
          set({ isMandatoryLogin: true, isLoginModalOpen: true });
        }
        return quota;
      }
      return null;
    } catch {
      return null;
    }
  },

  checkSession: async () => {
    try {
      set({ isLoading: true });
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        await get().fetchQuotaStatus();
        return false;
      }

      const body = await response.json();
      if (body.success && body.data?.user) {
        set({
          user: body.data.user,
          isAuthenticated: true,
          isLoading: false,
          isMandatoryLogin: false,
        });
        await get().fetchQuotaStatus();
        return true;
      }

      set({ user: null, isAuthenticated: false, isLoading: false });
      await get().fetchQuotaStatus();
      return false;
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
      await get().fetchQuotaStatus();
      return false;
    }
  },

  login: async (username: string, pin: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), pin: pin.trim() }),
      });

      const body = await response.json();
      if (!response.ok || !body.success) {
        return {
          success: false,
          error: body.error?.message || 'Đăng nhập không thành công',
        };
      }

      const user = body.data.user;
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        isLoginModalOpen: false,
        isMandatoryLogin: false,
      });

      await get().fetchQuotaStatus();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Lỗi kết nối máy chủ',
      };
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isMandatoryLogin: false,
        isChangePinModalOpen: false,
        isAdminUsersModalOpen: false,
      });
      await get().fetchQuotaStatus();
    }
  },
}));
