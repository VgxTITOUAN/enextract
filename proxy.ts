import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';

const PUBLIC_ROUTES = ['/login'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    const limited = enforceRateLimit(req);
    if (limited) return limited;
    return NextResponse.next();
  }

  if (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('enextract_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const payload = verifyToken(token);

  if (!payload) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};