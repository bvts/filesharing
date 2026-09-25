import { NextRequest } from 'next/server';
import { AUTH_HEADER_NAME, COOKIE_AUTH_NAME, verifyDeviceToken } from './crypto';

export function authenticateRequest(req: NextRequest): { authenticated: boolean; deviceId?: string; error?: string } {
  // Check custom header
  let token = req.headers.get(AUTH_HEADER_NAME);

  // Check Bearer header
  if (!token) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  // Check cookie
  if (!token) {
    const cookie = req.cookies.get(COOKIE_AUTH_NAME);
    if (cookie) {
      token = cookie.value;
    }
  }

  if (!token) {
    return { authenticated: false, error: 'Missing authentication credentials' };
  }

  const result = verifyDeviceToken(token);
  if (!result.valid || !result.deviceId) {
    return { authenticated: false, error: 'Invalid or expired authentication token' };
  }

  return { authenticated: true, deviceId: result.deviceId };
}
