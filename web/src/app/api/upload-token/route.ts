import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = authenticateRequest(request);
  if (!auth.authenticated || !auth.deviceId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Enforce that uploads are scoped under the authenticated device ID
        return {
          allowedContentTypes: ['*/*'],
          tokenPayload: JSON.stringify({
            deviceId: auth.deviceId,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Blob upload finished in Vercel Blob
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
