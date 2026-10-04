import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_AUTH_NAME, signAuthToken } from '@/lib/crypto';
import { checkPairCodeStatus } from '@/lib/metadata';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Code parameter is required' }, { status: 400 });
  }

  const cleanCode = code.trim();
  const status = await checkPairCodeStatus(cleanCode);

  if (status.claimed && status.deviceId) {
    const effectiveUserId = status.userId || status.deviceId;
    const authToken = signAuthToken(effectiveUserId, status.deviceId);
    const response = NextResponse.json({
      paired: true,
      deviceId: status.deviceId,
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
  }

  return NextResponse.json({
    paired: false,
    valid: Boolean(status.deviceId),
  });
}
