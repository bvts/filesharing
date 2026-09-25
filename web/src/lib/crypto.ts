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
  // Generate 6 digit numeric code
  const num = crypto.randomInt(100000, 999999);
  return num.toString();
}

export function signDeviceToken(deviceId: string): string {
  const secret = getAuthSecret();
  const payload = `${deviceId}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function verifyDeviceToken(token: string | null | undefined): { valid: boolean; deviceId?: string } {
  if (!token) return { valid: false };

  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split(':');
    if (parts.length !== 3) return { valid: false };

    const [deviceId, timestampStr, signature] = parts;
    const secret = getAuthSecret();
    const payload = `${deviceId}:${timestampStr}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return { valid: true, deviceId };
    }
  } catch {
    return { valid: false };
  }

  return { valid: false };
}
