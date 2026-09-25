import { NextRequest, NextResponse } from 'next/server';
import { readLocalBlob } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Key required' }, { status: 400 });
  }

  const blob = readLocalBlob(key);
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
