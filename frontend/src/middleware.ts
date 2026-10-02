import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/server/session';

/**
 * A cheap first gate.
 *
 * Checks only whether a session cookie exists, which costs nothing and spares
 * an unauthenticated visitor a round trip to the API before being sent to the
 * sign-in page. It is not the authorization check: the layouts verify the user
 * with the backend, and the backend enforces permissions on every request.
 */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // Remember where they were headed so signing in resumes it.
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Somebody already signed in has no use for the sign-in page. The root
  // route works out which area they belong to.
  if (hasSession && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Server Components cannot read the request path, and the guards need it
  // to send a reader back where they were after restoring their session.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', `${pathname}${search}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // Everything except Next's own assets and this app's API routes — the
    // proxy does its own token handling and must not be redirected.
    '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)',
  ],
};
