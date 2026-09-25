import { NextRequest, NextResponse } from 'next/server';
import { generatePairCode, generateSecureId, signDeviceToken } from '@/lib/crypto';
import { registerPairCode } from '@/lib/metadata';

export async function POST(req: NextRequest) {
  try {
    let body: { deviceId?: string; clientType?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Allow empty body
    }

    // If client already has a deviceId, bind code to it; otherwise create a new identity
    const deviceId = body.deviceId || generateSecureId('dev');
    const code = generatePairCode();
    const ttlSeconds = 600; // 10 minutes

    await registerPairCode(code, deviceId, ttlSeconds);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const qrPayload = JSON.stringify({
      code,
      deviceId,
      url: `${appUrl}?pair=${code}`,
    });

    return NextResponse.json({
      code,
      deviceId,
      expiresInSeconds: ttlSeconds,
      qrPayload,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to initiate pairing' }, { status: 500 });
  }
}
