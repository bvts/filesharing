import { NextRequest } from 'next/server';
import { AUTH_HEADER_NAME, COOKIE_AUTH_NAME, verifyAuthToken } from './crypto';

export interface AuthContext {
  authenticated: boolean;
  userId?: string;
  deviceId?: string;
  error?: string;
}

export function authenticateRequest(req: NextRequest): AuthContext {
  // 1. Check custom header (used by iOS app and background sync)
  let token = req.headers.get(AUTH_HEADER_NAME);

  // 2. Check Bearer authorization header
  if (!token) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  // 3. Check HTTP-only cookie (used by web app browser)
  if (!token) {
    const cookie = req.cookies.get(COOKIE_AUTH_NAME);
    if (cookie) {
      token = cookie.value;
    }
  }

  if (!token) {
    return { authenticated: false, error: 'Missing authentication credentials' };
  }

  const result = verifyAuthToken(token);
  if (!result.valid || !result.userId) {
    return { authenticated: false, error: 'Invalid or expired authentication token' };
  }

  return {
    authenticated: true,
    userId: result.userId,
    deviceId: result.deviceId || result.userId,
  };
}
