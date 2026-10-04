import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { authenticateRequest } from '@/lib/auth';
import { readLocalBlob } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const token = searchParams.get('token');

  if (!key) {
    return NextResponse.json({ error: 'Key required' }, { status: 400 });
  }

  let auth = authenticateRequest(req);
  if (!auth.authenticated && token) {
    const { verifyAuthToken } = await import('@/lib/crypto');
    const verified = verifyAuthToken(token);
    if (verified.valid && verified.userId) {
      auth = { authenticated: true, userId: verified.userId, deviceId: verified.deviceId };
    }
  }

  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized raw storage access' }, { status: 401 });
  }

  // Sanitize key against directory traversal
  const cleanKey = path.basename(key);

  // Validate that the key belongs to this user or device
  const userPrefix = `transfers_${auth.userId}_`;
  const devicePrefix = auth.deviceId ? `transfers_${auth.deviceId}_` : null;

  const isOwner = cleanKey.startsWith(userPrefix) || (devicePrefix && cleanKey.startsWith(devicePrefix));
  if (!isOwner) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const blob = readLocalBlob(cleanKey);
  if (!blob.exists) {
    return NextResponse.json({ error: 'Object not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(blob.data), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': blob.data.length.toString(),
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
