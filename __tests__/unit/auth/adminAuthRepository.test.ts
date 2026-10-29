import {
  createUser,
  deleteUser,
  findUserById,
  findUserByUsername,
  listUsers,
  updateUserByAdmin,
  updateUserPin,
} from '@/server/auth/authRepository';
import { hashPin, verifyPin } from '@/server/auth/pinSecurity';

describe('Admin User Management & PIN Change in authRepository', () => {
  const testUsername = 'admin_mgmt_user_test';
  const initialPin = '1234';
  let createdUserId: string;

  afterAll(() => {
    if (createdUserId) {
      deleteUser(createdUserId);
    }
  });

  it('creates a new user with hashed PIN', () => {
    const newUser = createUser({
      username: testUsername,
      displayName: 'Admin Mgmt User',
      pin: initialPin,
      role: 'member',
    });

    expect(newUser.id).toBeDefined();
    expect(newUser.username).toBe(testUsername);
    expect(newUser.displayName).toBe('Admin Mgmt User');
    expect(newUser.role).toBe('member');
    createdUserId = newUser.id;

    const fetched = findUserById(newUser.id);
    expect(fetched).not.toBeNull();
    expect(verifyPin(initialPin, fetched!.pinHash, fetched!.salt)).toBe(true);
  });

  it('lists users including the newly created user', () => {
    const allUsers = listUsers();
    expect(Array.isArray(allUsers)).toBe(true);
    const found = allUsers.find((u) => u.id === createdUserId);
    expect(found).toBeDefined();
    expect(found?.username).toBe(testUsername);
  });

  it('updates user PIN via updateUserPin (self-service PIN change)', () => {
    const newPin = '9999';
    const { hash, salt } = hashPin(newPin);
    const updated = updateUserPin(createdUserId, hash, salt);
    expect(updated).toBe(true);

    const fetched = findUserById(createdUserId);
    expect(verifyPin(newPin, fetched!.pinHash, fetched!.salt)).toBe(true);
    expect(verifyPin(initialPin, fetched!.pinHash, fetched!.salt)).toBe(false);
  });

  it('updates user role, display name and resets PIN via updateUserByAdmin', () => {
    const adminResetPin = '5555';
    const updated = updateUserByAdmin(createdUserId, {
      displayName: 'Promoted Admin',
      role: 'admin',
      pin: adminResetPin,
    });

    expect(updated).not.toBeNull();
    expect(updated?.displayName).toBe('Promoted Admin');
    expect(updated?.role).toBe('admin');

    const fetched = findUserById(createdUserId);
    expect(fetched?.role).toBe('admin');
    expect(verifyPin(adminResetPin, fetched!.pinHash, fetched!.salt)).toBe(true);
  });

  it('deletes user via deleteUser', () => {
    const deleted = deleteUser(createdUserId);
    expect(deleted).toBe(true);

    const fetched = findUserById(createdUserId);
    expect(fetched).toBeNull();

    const fetchedByUsername = findUserByUsername(testUsername);
    expect(fetchedByUsername).toBeNull();
  });
});
