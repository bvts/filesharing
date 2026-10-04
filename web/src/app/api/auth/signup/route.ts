import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, signAuthToken, COOKIE_AUTH_NAME } from '@/lib/crypto';
import { createUser } from '@/lib/metadata';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters long' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters long' },
        { status: 400 }
      );
    }

    const { hash, salt } = hashPassword(password);
    const user = await createUser(username, hash, salt);

    const authToken = signAuthToken(user.id, 'web');
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, username: user.username },
      authToken,
    });

    response.cookies.set({
      name: COOKIE_AUTH_NAME,
      value: authToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 400 }
    );
  }
}
