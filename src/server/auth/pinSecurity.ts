import crypto from 'node:crypto';

export interface PinHashResult {
  hash: string;
  salt: string;
}

export interface PinValidationResult {
  valid: boolean;
  error?: string;
}

const KEY_LENGTH = 64; // 64 bytes = 128 hex chars
const SALT_BYTES = 16; // 16 bytes = 32 hex chars
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

/**
 * Validate that a PIN consists of 4 to 8 digits.
 */
export function validatePinFormat(pin: unknown): PinValidationResult {
  if (typeof pin !== 'string') {
    return { valid: false, error: 'PIN must be a string' };
  }
  const trimmed = pin.trim();
  if (trimmed.length < 4 || trimmed.length > 8) {
    return { valid: false, error: 'PIN must be 4 to 8 digits long' };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: 'PIN may only contain digits' };
  }
  return { valid: true };
}

/**
 * Hash a numeric PIN using standard scrypt algorithm.
 */
export function hashPin(pin: string, customSalt?: string): PinHashResult {
  const validation = validatePinFormat(pin);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid PIN format');
  }

  const salt = customSalt || crypto.randomBytes(SALT_BYTES).toString('hex');
  const derivedKey = crypto.scryptSync(pin.trim(), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return {
    hash: derivedKey.toString('hex'),
    salt,
  };
}

/**
 * Verify a plain-text PIN against stored hash and salt using timing-safe comparison.
 */
export function verifyPin(pin: string, storedHash: string, salt: string): boolean {
  try {
    if (!pin || !storedHash || !salt) {
      return false;
    }
    const computed = crypto.scryptSync(pin.trim(), salt, KEY_LENGTH, SCRYPT_OPTIONS);
    const storedBuffer = Buffer.from(storedHash, 'hex');

    if (computed.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computed, storedBuffer);
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return false;
  }
}

/**
 * Generate a 256-bit cryptographic session token (64 hex characters).
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a clean user ID prefixed with `usr_`.
 */
export function generateUserId(username: string): string {
  const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user';
  const suffix = crypto.randomBytes(4).toString('hex');
  return `usr_${cleanUsername}_${suffix}`;
}
