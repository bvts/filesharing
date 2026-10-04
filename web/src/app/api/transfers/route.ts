import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { generateSecureId } from '@/lib/crypto';
import {
  addTransfer,
  cleanupExpiredTransfers,
  deleteAllTransfersForUser,
  getDefaultExpirationHours,
  getTransfersForUser,
} from '@/lib/metadata';
import { storeBlobObject } from '@/lib/storage';
import { TransferDirection, TransferMetadata } from '@/lib/types';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const data = await getTransfersForUser(auth.userId, auth.deviceId);
  return NextResponse.json({
    userId: auth.userId,
    deviceId: auth.deviceId || auth.userId,
    now: new Date().toISOString(),
    ...data,
  });
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    // Support multiple files under 'files' or single file under 'file'
    const files = formData.getAll('files') as File[];
    const singleFile = formData.get('file') as File | null;
    const fileList: File[] = files.length > 0 ? files : singleFile ? [singleFile] : [];

    const direction = (formData.get('direction') as TransferDirection) || 'pc_to_phone';
    const customExpirationHours = formData.get('expirationHours');

    if (fileList.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const maxSize = parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || '524288000', 10);
    const expirationHours = customExpirationHours
      ? parseInt(customExpirationHours.toString(), 10) || getDefaultExpirationHours()
      : getDefaultExpirationHours();
    const expiresAt = new Date(Date.now() + expirationHours * 3600 * 1000).toISOString();

    const createdTransfers: TransferMetadata[] = [];
    const errors: { filename: string; error: string }[] = [];

    for (const file of fileList) {
      if (file.size > maxSize) {
        errors.push({ filename: file.name, error: 'File size exceeds upload limit' });
        continue;
      }

      try {
        const transferId = generateSecureId('tr');
        const originalName = file.name || 'unnamed_file';
        const mimeType = file.type || 'application/octet-stream';
        const sizeBytes = file.size;

        const safeBaseName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePathname = `transfers/${auth.userId}/${transferId}/${safeBaseName}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const storedBlob = await storeBlobObject(storagePathname, buffer, mimeType);

        const transferRecord: TransferMetadata = {
          id: transferId,
          userId: auth.userId,
          deviceId: auth.deviceId || auth.userId,
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
        createdTransfers.push(transferRecord);
      } catch (err: any) {
        errors.push({ filename: file.name, error: err.message || 'Failed to process file' });
      }
    }

    if (createdTransfers.length === 0 && errors.length > 0) {
      return NextResponse.json({ error: 'All uploads failed', details: errors }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      transfers: createdTransfers,
      transfer: createdTransfers[0],
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload transfer' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'clear_expired') {
    const res = await cleanupExpiredTransfers(auth.userId);
    return NextResponse.json({ success: true, deletedCount: res.deletedCount });
  }

  if (action === 'clear_all') {
    const res = await deleteAllTransfersForUser(auth.userId);
    return NextResponse.json({ success: true, deletedCount: res.deletedCount });
  }

  return NextResponse.json({ error: 'Invalid delete action parameter' }, { status: 400 });
}
