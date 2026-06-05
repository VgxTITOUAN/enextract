import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

const SECRET = process.env.JWT_SECRET!;

export const AUTH_COOKIE = 'enextract_token';

export interface JwtPayload {
  id:    number;
  name:  string;
  email: string;
  role:  'admin' | 'commercial';
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Vérifie le JWT puis que l'utilisateur existe toujours (non supprimé). */
export async function verifyTokenActive(token: string): Promise<JwtPayload | null> {
  const payload = verifyToken(token);
  if (!payload) return null;

  const [rows]: any = await pool.execute(
    'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [payload.id],
  );

  if (!rows.length) return null;
  return payload;
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   0,
    path:     '/',
  });
}

export function unauthorizedResponse(): NextResponse {
  const response = NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  clearAuthCookie(response);
  return response;
}

export function redirectToLogin(req: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL('/login', req.url));
  clearAuthCookie(response);
  return response;
}