import { NextRequest, NextResponse } from 'next/server';
import { generatePairCode, generateSecureId } from '@/lib/crypto';
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

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

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
    console.error('[pair/start] Failed to initiate pairing:', error);
    return NextResponse.json(
      { error: 'Failed to initiate pairing: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
