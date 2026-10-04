import crypto from 'node:crypto';

export const AUTH_HEADER_NAME = 'x-transfer-auth';
export const COOKIE_AUTH_NAME = 'transfer_auth';

function getAuthSecret(): string {
  return process.env.TRANSFER_AUTH_SECRET || 'dev_secret_personal_transfer_key_min_32';
}

export function generateSecureId(prefix = ''): string {
  const bytes = crypto.randomBytes(16).toString('hex');
  return prefix ? `${prefix}_${bytes}` : bytes;
}

export function generatePairCode(): string {
  const num = crypto.randomInt(100000, 999999);
  return num.toString();
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derived = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    const bufDerived = Buffer.from(derived, 'hex');
    const bufHash = Buffer.from(hash, 'hex');
    if (bufDerived.length !== bufHash.length) return false;
    return crypto.timingSafeEqual(bufDerived, bufHash);
  } catch {
    return false;
  }
}

export function signAuthToken(userId: string, deviceId: string): string {
  const secret = getAuthSecret();
  const payload = `usr:${userId}:${deviceId}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function verifyAuthToken(token: string | null | undefined): {
  valid: boolean;
  userId?: string;
  deviceId?: string;
} {
  if (!token) return { valid: false };

  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const secret = getAuthSecret();

    if (raw.startsWith('usr:')) {
      const parts = raw.split(':');
      if (parts.length !== 5) return { valid: false };
      const [, userId, deviceId, timestampStr, signature] = parts;
      const payload = `usr:${userId}:${deviceId}:${timestampStr}`;
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      if (signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return { valid: true, userId, deviceId };
      }
      return { valid: false };
    }

    // Legacy device token format
    const parts = raw.split(':');
    if (parts.length === 3) {
      const [deviceId, timestampStr, signature] = parts;
      const payload = `${deviceId}:${timestampStr}`;
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      if (signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return { valid: true, deviceId, userId: deviceId };
      }
    }
  } catch {
    return { valid: false };
  }

  return { valid: false };
}

// Aliases for backward compatibility
export function signDeviceToken(deviceId: string): string {
  return signAuthToken(deviceId, deviceId);
}

export function verifyDeviceToken(token: string | null | undefined): {
  valid: boolean;
  deviceId?: string;
  userId?: string;
} {
  return verifyAuthToken(token);
}
