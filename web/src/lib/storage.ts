import { put, del } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TransferMetadata } from './types';

export function isVercelBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function getStorageDir(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmp = path.join(os.tmpdir(), 'transfer-app-storage');
    try {
      if (!fs.existsSync(tmp)) {
        fs.mkdirSync(tmp, { recursive: true });
      }
    } catch {}
    return tmp;
  }

  try {
    const localDir = path.join(process.cwd(), '.local-storage');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return localDir;
  } catch {
    const tmp = path.join(os.tmpdir(), 'transfer-app-storage');
    try {
      if (!fs.existsSync(tmp)) {
        fs.mkdirSync(tmp, { recursive: true });
      }
    } catch {}
    return tmp;
  }
}

function ensureLocalDir(): string {
  const dir = getStorageDir();
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn('Could not create storage dir:', e);
    }
  }
  return dir;
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
  const dir = ensureLocalDir();
  const safeFilename = pathname.replace(/[/\\]/g, '_');
  const filePath = path.join(dir, safeFilename);
  
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
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
    const dir = ensureLocalDir();
    const safeFilename = path.basename(blobUrlOrPath).replace(/[/\\]/g, '_');
    const directPath = path.join(dir, safeFilename);
    if (fs.existsSync(directPath)) {
      fs.unlinkSync(directPath);
    }
  } catch (err) {
    console.error('Failed to delete local blob:', err);
  }
}

export function readLocalBlob(key: string): { data: Buffer; exists: boolean } {
  const dir = getStorageDir();
  const filePath = path.join(dir, path.basename(key));
  if (fs.existsSync(filePath)) {
    return { data: fs.readFileSync(filePath), exists: true };
  }
  return { data: Buffer.alloc(0), exists: false };
}
