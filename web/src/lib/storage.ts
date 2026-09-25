import { put, del } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';
import { TransferMetadata } from './types';

const LOCAL_STORAGE_DIR = path.join(process.cwd(), '.local-storage');

function isVercelBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function ensureLocalDir() {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
}

export async function storeBlobObject(
  pathname: string,
  body: Buffer | ReadableStream | string,
  contentType: string
): Promise<{ url: string; pathname: string }> {
  if (isVercelBlobConfigured()) {
    const blob = await put(pathname, body, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });
    return {
      url: blob.url,
      pathname: blob.pathname,
    };
  }

  // Local filesystem fallback for dev without network or Blob token
  ensureLocalDir();
  const safeFilename = pathname.replace(/[/\\]/g, '_');
  const filePath = path.join(LOCAL_STORAGE_DIR, safeFilename);
  
  if (Buffer.isBuffer(body)) {
    fs.writeFileSync(filePath, body);
  } else if (typeof body === 'string') {
    fs.writeFileSync(filePath, Buffer.from(body, 'utf-8'));
  } else {
    // Stream
    const chunks: Buffer[] = [];
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
    fs.writeFileSync(filePath, Buffer.concat(chunks));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return {
    url: `${appUrl}/api/storage/raw?key=${encodeURIComponent(safeFilename)}`,
    pathname,
  };
}

export async function deleteBlobObject(blobUrlOrPath: string): Promise<void> {
  if (!blobUrlOrPath) return;

  if (isVercelBlobConfigured()) {
    try {
      await del(blobUrlOrPath);
    } catch (err) {
      console.error('Failed to delete Vercel Blob:', err);
    }
    return;
  }

  try {
    ensureLocalDir();
    const safeFilename = path.basename(blobUrlOrPath).replace(/[/\\]/g, '_');
    const directPath = path.join(LOCAL_STORAGE_DIR, safeFilename);
    if (fs.existsSync(directPath)) {
      fs.unlinkSync(directPath);
    }
  } catch (err) {
    console.error('Failed to delete local blob:', err);
  }
}

export function readLocalBlob(key: string): { data: Buffer; exists: boolean } {
  const filePath = path.join(LOCAL_STORAGE_DIR, path.basename(key));
  if (fs.existsSync(filePath)) {
    return { data: fs.readFileSync(filePath), exists: true };
  }
  return { data: Buffer.alloc(0), exists: false };
}
