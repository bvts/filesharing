import { NextRequest, NextResponse } from 'next/server';
import { generatePairCode, generateSecureId } from '@/lib/crypto';
import { registerPairCode } from '@/lib/metadata';
import { authenticateRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    let body: { deviceId?: string; clientType?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Allow empty body
    }

    const auth = authenticateRequest(req);
    const userId = auth.authenticated && auth.userId ? auth.userId : undefined;

    const deviceId = body.deviceId || generateSecureId('dev');
    const code = generatePairCode();
    const ttlSeconds = 600; // 10 minutes

    await registerPairCode(code, deviceId, ttlSeconds, userId);

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

    const qrPayload = JSON.stringify({
      code,
      deviceId,
      userId,
      url: `${appUrl}?pair=${code}`,
    });

    return NextResponse.json({
      code,
      deviceId,
      userId,
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
