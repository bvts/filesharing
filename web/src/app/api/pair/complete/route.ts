import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_AUTH_NAME, signAuthToken } from '@/lib/crypto';
import { consumePairCode } from '@/lib/metadata';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, clientType } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const cleanCode = code.trim();
    const result = await consumePairCode(cleanCode);

    if (!result) {
      return NextResponse.json({ error: 'Invalid or expired pairing code' }, { status: 401 });
    }

    const { deviceId, userId } = result;
    const effectiveUserId = userId || deviceId;
    const authToken = signAuthToken(effectiveUserId, deviceId);

    const response = NextResponse.json({
      success: true,
      deviceId,
      userId: effectiveUserId,
      authToken,
    });

    response.cookies.set({
      name: COOKIE_AUTH_NAME,
      value: authToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to complete pairing' }, { status: 500 });
  }
}
