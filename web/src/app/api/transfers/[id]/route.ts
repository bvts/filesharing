import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { deleteTransfer, getTransfer } from '@/lib/metadata';

interface RouteContext {
  params: {
    id: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = authenticateRequest(req);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const transfer = await getTransfer(params.id);
  const isOwner =
    transfer &&
    (transfer.userId ? transfer.userId === auth.userId : transfer.deviceId === auth.deviceId || transfer.deviceId === auth.userId);

  if (!transfer || !isOwner) {
    return NextResponse.json({ error: 'Transfer not found or access denied' }, { status: 404 });
  }

  return NextResponse.json({ transfer });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = authenticateRequest(req);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const transfer = await getTransfer(params.id);
  const isOwner =
    transfer &&
    (transfer.userId ? transfer.userId === auth.userId : transfer.deviceId === auth.deviceId || transfer.deviceId === auth.userId);

  if (!transfer || !isOwner) {
    return NextResponse.json({ error: 'Transfer not found or access denied' }, { status: 404 });
  }

  await deleteTransfer(params.id);
  return NextResponse.json({ success: true });
}
