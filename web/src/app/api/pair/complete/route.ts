import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_AUTH_NAME, signDeviceToken } from '@/lib/crypto';
import { consumePairCode } from '@/lib/metadata';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, clientType } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const cleanCode = code.trim();
    const deviceId = await consumePairCode(cleanCode);

    if (!deviceId) {
      return NextResponse.json({ error: 'Invalid or expired pairing code' }, { status: 401 });
    }

    const authToken = signDeviceToken(deviceId);

    const response = NextResponse.json({
      success: true,
      deviceId,
      authToken,
    });

    // Set secure HTTP-only cookie for browser client
    response.cookies.set({
      name: COOKIE_AUTH_NAME,
      value: authToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60, // 1 year
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to complete pairing' }, { status: 500 });
  }
}
