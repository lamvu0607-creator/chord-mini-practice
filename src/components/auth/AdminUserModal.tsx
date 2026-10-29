'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
  Chip,
  Tabs,
  Tab,
} from '@heroui/react';
import { FiUsers, FiUserPlus, FiKey, FiTrash2, FiShield, FiRefreshCw, FiCheckCircle } from 'react-icons/fi';
import { useAuthStore } from '@/stores/authStore';

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  createdAtMs: number;
  updatedAtMs: number;
}

export default function AdminUserModal() {
  const { isAdminUsersModalOpen, closeAdminUsersModal, user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  // Create form state
  const [createUsername, setCreateUsername] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createPin, setCreatePin] = useState('');
  const [createRole, setCreateRole] = useState<'member' | 'admin'>('member');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Reset PIN state
  const [resettingUser, setResettingUser] = useState<AdminUser | null>(null);
  const [newPinForReset, setNewPinForReset] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  // Delete state
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch('/api/auth/admin/users', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data?.users)) {
        setUsers(data.data.users);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (isAdminUsersModalOpen) {
      fetchUsers();
    }
  }, [isAdminUsersModalOpen, fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!createUsername.trim() || !/^[a-zA-Z0-9_]{3,20}$/.test(createUsername.trim())) {
      setCreateError('Tên đăng nhập phải từ 3 đến 20 ký tự (không dấu, chỉ gồm chữ, số hoặc gạch dưới)');
      return;
    }

    if (!createPin.trim() || createPin.trim().length < 4 || createPin.trim().length > 8) {
      setCreateError('Mã PIN phải từ 4 đến 8 chữ số');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/api/auth/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: createUsername.trim(),
          displayName: createDisplayName.trim() || createUsername.trim(),
          pin: createPin.trim(),
          role: createRole,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.error?.message || 'Tạo tài khoản thất bại');
        return;
      }

      setCreateSuccess(`Đã tạo tài khoản "${createUsername}" thành công!`);
      setCreateUsername('');
      setCreateDisplayName('');
      setCreatePin('');
      setCreateRole('member');
      fetchUsers();
      setTimeout(() => {
        setCreateSuccess(null);
        setActiveTab('list');
      }, 1500);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ');
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;
    setResetError(null);
    setResetSuccess(null);

    if (!newPinForReset.trim() || newPinForReset.trim().length < 4 || newPinForReset.trim().length > 8) {
      setResetError('Mã PIN mới phải từ 4 đến 8 chữ số');
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch(`/api/auth/admin/users/${resettingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPinForReset.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setResetError(data.error?.message || 'Đặt lại PIN thất bại');
        return;
      }

      setResetSuccess(`Đã đặt lại mã PIN cho "${resettingUser.username}" thành công!`);
      setTimeout(() => {
        setResettingUser(null);
        setNewPinForReset('');
        setResetSuccess(null);
      }, 1500);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleteError(null);
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/auth/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.error?.message || 'Xóa tài khoản thất bại');
        return;
      }

      setDeletingUser(null);
      fetchUsers();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (timestampMs: number) => {
    if (!timestampMs) return '—';
    return new Date(timestampMs).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <>
      <Modal
        isOpen={isAdminUsersModalOpen && !resettingUser && !deletingUser}
        onClose={closeAdminUsersModal}
        placement="center"
        size="3xl"
        backdrop="blur"
        classNames={{
          base: 'bg-content1 dark:bg-zinc-900 border border-divider shadow-2xl rounded-2xl max-w-3xl mx-4',
          header: 'border-b border-divider py-4 px-6',
          body: 'py-6 px-6',
          footer: 'border-t border-divider py-3 px-6',
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <FiShield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Quản lý Tài khoản (Admin)</h3>
                    <p className="text-xs text-default-500 font-normal">Quản lý danh sách người dùng và cấp mã PIN</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="light"
                  onPress={fetchUsers}
                  isLoading={isLoadingUsers}
                  startContent={<FiRefreshCw className="w-3.5 h-3.5" />}
                >
                  Làm mới
                </Button>
              </ModalHeader>

              <ModalBody className="flex flex-col gap-4">
                <Tabs
                  selectedKey={activeTab}
                  onSelectionChange={(key) => setActiveTab(key as 'list' | 'create')}
                  color="primary"
                  variant="underlined"
                  classNames={{
                    tabList: 'gap-6 w-full relative rounded-none p-0 border-b border-divider',
                    cursor: 'w-full bg-primary',
                    tab: 'max-w-fit px-0 h-10',
                  }}
                >
                  <Tab
                    key="list"
                    title={
                      <div className="flex items-center gap-2">
                        <FiUsers className="w-4 h-4" />
                        <span>Danh sách người dùng ({users.length})</span>
                      </div>
                    }
                  >
                    <div className="flex flex-col gap-2 pt-2 max-h-[50vh] overflow-y-auto pr-1">
                      {isLoadingUsers && users.length === 0 ? (
                        <div className="text-center py-8 text-default-400 text-sm">Đang tải danh sách người dùng...</div>
                      ) : users.length === 0 ? (
                        <div className="text-center py-8 text-default-400 text-sm">Chưa có người dùng nào</div>
                      ) : (
                        users.map((u) => {
                          const isSelf = u.id === currentUser?.id;
                          return (
                            <div
                              key={u.id}
                              className="flex items-center justify-between p-3 rounded-xl bg-default-50 dark:bg-zinc-800/60 border border-divider hover:border-default-400 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                                  {u.username.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-foreground">{u.displayName}</span>
                                    <span className="text-xs text-default-400">(@{u.username})</span>
                                    <Chip
                                      size="sm"
                                      color={u.role === 'admin' ? 'primary' : 'default'}
                                      variant="flat"
                                      className="text-[11px] h-5"
                                    >
                                      {u.role === 'admin' ? 'Admin' : 'Member'}
                                    </Chip>
                                    {isSelf && (
                                      <Chip size="sm" color="success" variant="dot" className="text-[10px] h-5">
                                        Bạn
                                      </Chip>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-default-400">
                                    Tạo ngày: {formatDate(u.createdAtMs)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="flat"
                                  color="warning"
                                  startContent={<FiKey className="w-3.5 h-3.5" />}
                                  onPress={() => {
                                    setNewPinForReset('');
                                    setResetError(null);
                                    setResetSuccess(null);
                                    setResettingUser(u);
                                  }}
                                  className="h-8 text-xs font-medium"
                                >
                                  Đặt lại PIN
                                </Button>
                                {!isSelf && (
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    color="danger"
                                    startContent={<FiTrash2 className="w-3.5 h-3.5" />}
                                    onPress={() => {
                                      setDeleteError(null);
                                      setDeletingUser(u);
                                    }}
                                    className="h-8 text-xs font-medium"
                                  >
                                    Xóa
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </Tab>

                  <Tab
                    key="create"
                    title={
                      <div className="flex items-center gap-2">
                        <FiUserPlus className="w-4 h-4" />
                        <span>Thêm tài khoản mới</span>
                      </div>
                    }
                  >
                    <form onSubmit={handleCreateUser} className="flex flex-col gap-4 pt-3">
                      {createSuccess && (
                        <div className="p-3 rounded-xl bg-success-50 dark:bg-success-950/40 border border-success-200 dark:border-success-800 text-success text-sm flex items-center gap-2">
                          <FiCheckCircle className="w-4 h-4" />
                          <span>{createSuccess}</span>
                        </div>
                      )}
                      {createError && (
                        <div className="p-3 rounded-xl bg-danger-50 dark:bg-danger-950/40 border border-danger-200 dark:border-danger-800 text-danger text-sm flex items-center gap-2">
                          <span>⚠️</span>
                          <span>{createError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label="Tên đăng nhập (Username)"
                          placeholder="Ví dụ: nam_guitar"
                          variant="bordered"
                          value={createUsername}
                          onValueChange={(val) => {
                            setCreateUsername(val);
                            setCreateError(null);
                          }}
                          isRequired
                        />
                        <Input
                          label="Tên hiển thị (Display Name)"
                          placeholder="Ví dụ: Nam Guitarist"
                          variant="bordered"
                          value={createDisplayName}
                          onValueChange={setCreateDisplayName}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label="Mã PIN ban đầu"
                          placeholder="4 - 8 chữ số"
                          type="password"
                          inputMode="numeric"
                          variant="bordered"
                          value={createPin}
                          onValueChange={(val) => {
                            setCreatePin(val);
                            setCreateError(null);
                          }}
                          isRequired
                        />
                        <Select
                          label="Vai trò (Role)"
                          selectedKeys={[createRole]}
                          onSelectionChange={(keys) => {
                            const selected = Array.from(keys)[0] as 'member' | 'admin';
                            if (selected) setCreateRole(selected);
                          }}
                          variant="bordered"
                        >
                          <SelectItem key="member" textValue="Thành viên (Member)">
                            Thành viên (Member) - Sử dụng không giới hạn
                          </SelectItem>
                          <SelectItem key="admin" textValue="Quản trị viên (Admin)">
                            Quản trị viên (Admin) - Toàn quyền quản lý
                          </SelectItem>
                        </Select>
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button color="primary" type="submit" isLoading={isCreating} className="font-semibold">
                          Tạo tài khoản
                        </Button>
                      </div>
                    </form>
                  </Tab>
                </Tabs>
              </ModalBody>

              <ModalFooter>
                <Button variant="light" onPress={closeAdminUsersModal}>
                  Đóng
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Modal Đặt lại mã PIN (Reset PIN) */}
      <Modal
        isOpen={Boolean(resettingUser)}
        onClose={() => setResettingUser(null)}
        placement="center"
        backdrop="blur"
      >
        <ModalContent>
          {() => (
            <form onSubmit={handleResetPin}>
              <ModalHeader className="flex items-center gap-2">
                <FiKey className="w-5 h-5 text-warning" />
                <span>Đặt lại mã PIN cho @{resettingUser?.username}</span>
              </ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                {resetSuccess && (
                  <div className="p-3 rounded-xl bg-success-50 text-success text-sm flex items-center gap-2">
                    <FiCheckCircle className="w-4 h-4" />
                    <span>{resetSuccess}</span>
                  </div>
                )}
                {resetError && (
                  <div className="p-3 rounded-xl bg-danger-50 text-danger text-sm">
                    ⚠️ {resetError}
                  </div>
                )}
                <Input
                  autoFocus
                  label="Mã PIN mới"
                  placeholder="Nhập 4 - 8 chữ số mới"
                  type="password"
                  inputMode="numeric"
                  variant="bordered"
                  value={newPinForReset}
                  onValueChange={(val) => {
                    setNewPinForReset(val);
                    setResetError(null);
                  }}
                  isRequired
                />
                <p className="text-xs text-default-400">
                  Lưu ý: Mọi phiên làm việc cũ của tài khoản này sẽ tự động bị hủy sau khi đặt lại mã PIN.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => setResettingUser(null)} disabled={isResetting}>
                  Hủy
                </Button>
                <Button color="warning" type="submit" isLoading={isResetting} className="font-semibold">
                  Lưu mã PIN mới
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* Modal Xác nhận Xóa người dùng */}
      <Modal
        isOpen={Boolean(deletingUser)}
        onClose={() => setDeletingUser(null)}
        placement="center"
        backdrop="blur"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center gap-2 text-danger">
                <FiTrash2 className="w-5 h-5" />
                <span>Xác nhận xóa tài khoản</span>
              </ModalHeader>
              <ModalBody className="flex flex-col gap-2">
                {deleteError && (
                  <div className="p-3 rounded-xl bg-danger-50 text-danger text-sm">
                    ⚠️ {deleteError}
                  </div>
                )}
                <p className="text-sm">
                  Bạn có chắc chắn muốn xóa tài khoản <strong>@{deletingUser?.username}</strong> ({deletingUser?.displayName})?
                </p>
                <p className="text-xs text-default-400">
                  Hành động này không thể hoàn tác. Mọi phiên đăng nhập của tài khoản này sẽ bị hủy ngay lập tức.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => setDeletingUser(null)} disabled={isDeleting}>
                  Hủy
                </Button>
                <Button color="danger" onPress={handleDeleteUser} isLoading={isDeleting} className="font-semibold">
                  Xóa tài khoản
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
