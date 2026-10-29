import {
  generateSessionToken,
  generateUserId,
  hashPin,
  validatePinFormat,
  verifyPin,
} from '@/server/auth/pinSecurity';

describe('pinSecurity module', () => {
  describe('validatePinFormat', () => {
    it('accepts valid 4 to 8 digit pins', () => {
      expect(validatePinFormat('1234').valid).toBe(true);
      expect(validatePinFormat('123456').valid).toBe(true);
      expect(validatePinFormat('98765432').valid).toBe(true);
    });

    it('rejects pins shorter than 4 digits or longer than 8 digits', () => {
      expect(validatePinFormat('123').valid).toBe(false);
      expect(validatePinFormat('123456789').valid).toBe(false);
      expect(validatePinFormat('').valid).toBe(false);
    });

    it('rejects non-digit characters', () => {
      expect(validatePinFormat('12a4').valid).toBe(false);
      expect(validatePinFormat('abcd').valid).toBe(false);
      expect(validatePinFormat('12 34').valid).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(validatePinFormat(null).valid).toBe(false);
      expect(validatePinFormat(undefined).valid).toBe(false);
      expect(validatePinFormat(1234 as unknown as string).valid).toBe(false);
    });
  });

  describe('hashPin & verifyPin', () => {
    it('hashes a PIN and verifies it successfully', () => {
      const pin = '123456';
      const { hash, salt } = hashPin(pin);

      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(hash.length).toBe(128); // 64 bytes in hex = 128 chars
      expect(salt.length).toBe(32);  // 16 bytes in hex = 32 chars

      const isValid = verifyPin(pin, hash, salt);
      expect(isValid).toBe(true);
    });

    it('fails verification when an incorrect PIN is provided', () => {
      const pin = '123456';
      const { hash, salt } = hashPin(pin);

      expect(verifyPin('654321', hash, salt)).toBe(false);
      expect(verifyPin('000000', hash, salt)).toBe(false);
    });

    it('fails verification when an incorrect salt is provided', () => {
      const pin = '123456';
      const { hash } = hashPin(pin);
      const wrongSalt = '00000000000000000000000000000000';

      expect(verifyPin(pin, hash, wrongSalt)).toBe(false);
    });

    it('produces different salts and hashes for the same PIN', () => {
      const pin = '1234';
      const res1 = hashPin(pin);
      const res2 = hashPin(pin);

      expect(res1.salt).not.toEqual(res2.salt);
      expect(res1.hash).not.toEqual(res2.hash);
      expect(verifyPin(pin, res1.hash, res1.salt)).toBe(true);
      expect(verifyPin(pin, res2.hash, res2.salt)).toBe(true);
    });

    it('throws when hashing an invalid pin format', () => {
      expect(() => hashPin('12')).toThrow();
      expect(() => hashPin('abcd')).toThrow();
    });
  });

  describe('generateSessionToken', () => {
    it('generates a 64-character hex string with sufficient entropy', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();

      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(token1)).toBe(true);
      expect(token1).not.toEqual(token2);
    });
  });

  describe('generateUserId', () => {
    it('generates clean user ID with usr_ prefix', () => {
      const id1 = generateUserId('Admin_User!');
      expect(id1.startsWith('usr_adminuser_')).toBe(true);

      const id2 = generateUserId('');
      expect(id2.startsWith('usr_user_')).toBe(true);
    });
  });
});
