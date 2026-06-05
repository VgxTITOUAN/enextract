import { NextRequest, NextResponse } from 'next/server';
import { redirectToLogin, unauthorizedResponse, verifyTokenActive } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';

const PUBLIC_ROUTES = ['/login'];
const PUBLIC_API_PREFIXES = ['/api/auth/login'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    const limited = enforceRateLimit(req);
    if (limited) return limited;

    const isPublicApi = PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p));
    if (!isPublicApi) {
      const token = req.cookies.get('enextract_token')?.value;
      if (token) {
        const payload = await verifyTokenActive(token);
        if (!payload) return unauthorizedResponse();
      }
    }

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
    return redirectToLogin(req);
  }

  const payload = await verifyTokenActive(token);

  if (!payload) {
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};