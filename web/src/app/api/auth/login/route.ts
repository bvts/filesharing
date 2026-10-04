import { NextRequest, NextResponse } from 'next/server';
import { signAuthToken, verifyPassword, COOKIE_AUTH_NAME } from '@/lib/crypto';
import { getUserByUsername } from '@/lib/metadata';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const isValid = verifyPassword(password, user.passwordHash, user.salt);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

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
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
