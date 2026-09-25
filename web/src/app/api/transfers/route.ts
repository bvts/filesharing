import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { generateSecureId } from '@/lib/crypto';
import {
  addTransfer,
  cleanupExpiredTransfers,
  deleteAllTransfersForDevice,
  getDefaultExpirationHours,
  getTransfersForDevice,
} from '@/lib/metadata';
import { storeBlobObject } from '@/lib/storage';
import { TransferDirection, TransferMetadata } from '@/lib/types';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (!auth.authenticated || !auth.deviceId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const data = await getTransfersForDevice(auth.deviceId);
  return NextResponse.json({
    deviceId: auth.deviceId,
    now: new Date().toISOString(),
    ...data,
  });
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (!auth.authenticated || !auth.deviceId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const direction = (formData.get('direction') as TransferDirection) || 'pc_to_phone';
    const customExpirationHours = formData.get('expirationHours');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const transferId = generateSecureId('tr');
    const originalName = file.name || 'unnamed_file';
    const mimeType = file.type || 'application/octet-stream';
    const sizeBytes = file.size;

    // Check maximum upload size limit
    const maxSize = parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || '524288000', 10);
    if (sizeBytes > maxSize) {
      return NextResponse.json({ error: 'File size exceeds server upload limit' }, { status: 413 });
    }

    const expirationHours = customExpirationHours
      ? parseInt(customExpirationHours.toString(), 10) || getDefaultExpirationHours()
      : getDefaultExpirationHours();

    const expiresAt = new Date(Date.now() + expirationHours * 3600 * 1000).toISOString();

    // Sanitize pathname for storage
    const safeBaseName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePathname = `transfers/${auth.deviceId}/${transferId}/${safeBaseName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storedBlob = await storeBlobObject(storagePathname, buffer, mimeType);

    const transferRecord: TransferMetadata = {
      id: transferId,
      deviceId: auth.deviceId,
      filename: originalName,
      mimeType,
      sizeBytes,
      direction,
      status: 'ready',
      blobUrl: storedBlob.url,
      blobPathname: storedBlob.pathname,
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    await addTransfer(transferRecord);

    return NextResponse.json({
      success: true,
      transfer: transferRecord,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload transfer' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (!auth.authenticated || !auth.deviceId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'clear_expired') {
    const res = await cleanupExpiredTransfers(auth.deviceId);
    return NextResponse.json({ success: true, deletedCount: res.deletedCount });
  }

  if (action === 'clear_all') {
    const res = await deleteAllTransfersForDevice(auth.deviceId);
    return NextResponse.json({ success: true, deletedCount: res.deletedCount });
  }

  return NextResponse.json({ error: 'Invalid delete action parameter' }, { status: 400 });
}
