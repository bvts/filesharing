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
  // Allow authentication via cookie/header OR query token for direct download anchors
  const { searchParams } = new URL(req.url);
  const queryToken = searchParams.get('token');

  let auth = authenticateRequest(req);
  if (!auth.authenticated && queryToken) {
    const { verifyDeviceToken } = await import('@/lib/crypto');
    const verified = verifyDeviceToken(queryToken);
    if (verified.valid && verified.deviceId) {
      auth = { authenticated: true, deviceId: verified.deviceId };
    }
  }

  if (!auth.authenticated || !auth.deviceId) {
    return NextResponse.json({ error: 'Unauthorized download access' }, { status: 401 });
  }

  const transfer = await getTransfer(params.id);
  if (!transfer || transfer.deviceId !== auth.deviceId) {
    return NextResponse.json({ error: 'Transfer not found or expired' }, { status: 404 });
  }

  // If stored in Vercel Blob, redirect directly to the signed/public URL with download header disposition
  if (transfer.blobUrl.startsWith('http://') || transfer.blobUrl.startsWith('https://')) {
    // If it's a remote Vercel Blob URL
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
