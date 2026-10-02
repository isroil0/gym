import { NextResponse } from 'next/server';
import { clearTokens, markRestored, readTokens, wasJustRestored, writeTokens } from '@/lib/server/session';
import { refreshTokens } from '@/lib/server/refresh';

export const dynamic = 'force-dynamic';

/**
 * Rescues a session whose access token has expired, or ends it for good.
 *
 * The two gates in front of a page disagree by design: middleware checks only
 * that a refresh cookie exists (thirty days), while the layout asks the
 * backend who the reader is using the access cookie (twenty minutes). Between
 * those two lifetimes a reader holds a cookie middleware trusts and the
 * layout rejects, and sending them to the sign-in page bounces them straight
 * back off middleware — an endless redirect. Spending the refresh token is
 * what breaks the tie, and a Server Component cannot do it: only a route
 * handler or an action may write cookies. That is this route.
 *
 * It either restores the session and returns the reader to where they were,
 * or clears both cookies so the sign-in page is finally reachable.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);

  // A second restore within seconds means the refreshed session still cannot
  // load the page. This route exists to end redirect loops, so it must never
  // become one: sign out instead and let them in through the front door.
  if (await wasJustRestored()) return await signOut(url.origin);

  const { refreshToken } = await readTokens();
  if (!refreshToken) return await signOut(url.origin);

  const outcome = await refreshTokens(refreshToken);
  if (!outcome.ok) return await signOut(url.origin);

  await writeTokens(outcome.tokens);
  await markRestored();

  return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')) ?? '/', url.origin), 303);
}

async function signOut(origin: string): Promise<NextResponse> {
  await clearTokens();
  return NextResponse.redirect(new URL('/login', origin), 303);
}

/**
 * Only a path on this site. An absolute URL or a protocol-relative `//host`
 * would turn a redirect meant to resume a page into an open redirect.
 */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}
