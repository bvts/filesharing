import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getTransfer } from '@/lib/metadata';
import { readLocalBlob } from '@/lib/storage';

interface RouteContext {
  params: {
    id: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { searchParams } = new URL(req.url);
  const queryToken = searchParams.get('token');

  let auth = authenticateRequest(req);
  if (!auth.authenticated && queryToken) {
    const { verifyAuthToken } = await import('@/lib/crypto');
    const verified = verifyAuthToken(queryToken);
    if (verified.valid && verified.userId) {
      auth = { authenticated: true, userId: verified.userId, deviceId: verified.deviceId };
    }
  }

  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized download access' }, { status: 401 });
  }

  const transfer = await getTransfer(params.id);
  const isOwner =
    transfer &&
    (transfer.userId ? transfer.userId === auth.userId : transfer.deviceId === auth.deviceId || transfer.deviceId === auth.userId);

  if (!transfer || !isOwner) {
    // Return 404 so attackers cannot probe for existence of transfers across accounts
    return NextResponse.json({ error: 'Transfer not found or expired' }, { status: 404 });
  }

  // If stored in Vercel Blob, redirect directly to the signed/public URL with download header disposition
  if (transfer.blobUrl.startsWith('http://') || transfer.blobUrl.startsWith('https://')) {
    if (!transfer.blobUrl.includes('/api/storage/raw')) {
      const response = NextResponse.redirect(transfer.blobUrl, 302);
      response.headers.set(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(transfer.filename)}"`
      );
      return response;
    }
  }

  // Local storage fallback: stream buffer directly
  const localBlobKey = transfer.blobPathname.replace(/[/\\]/g, '_');
  const localBlob = readLocalBlob(localBlobKey);

  if (!localBlob.exists) {
    return NextResponse.json({ error: 'Storage object missing on disk' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(localBlob.data), {
    status: 200,
    headers: {
      'Content-Type': transfer.mimeType || 'application/octet-stream',
      'Content-Length': localBlob.data.length.toString(),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(transfer.filename)}"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
