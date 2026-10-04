import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getUserById } from '@/lib/metadata';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await getUserById(auth.userId);
  if (!user) {
    // If user record is somehow gone or deviceId-only, return basic identity
    return NextResponse.json({
      authenticated: true,
      user: {
        id: auth.userId,
        username: 'user_' + auth.userId.slice(-6),
      },
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
    },
  });
}
