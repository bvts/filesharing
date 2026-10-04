import { NextResponse } from 'next/server';
import { COOKIE_AUTH_NAME } from '@/lib/crypto';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_AUTH_NAME);
  return response;
}
