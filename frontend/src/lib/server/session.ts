import 'server-only';
import { cookies } from 'next/headers';
import { serverEnv } from './env';

/**
 * Tokens live in httpOnly cookies and are attached to backend calls by the
 * proxy route, never by the browser. Script running on the page — including
 * anything injected through an XSS hole — cannot read them.
 */
export const ACCESS_COOKIE = 'gym_at';
export const REFRESH_COOKIE = 'gym_rt';

/** Mirrors the access token's lifetime closely enough to avoid a stale read. */
const ACCESS_MAX_AGE = 60 * 20;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

const base = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: serverEnv.secureCookies,
} as const;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export async function readTokens(): Promise<Partial<SessionTokens>> {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value,
    refreshToken: jar.get(REFRESH_COOKIE)?.value,
  };
}

export async function writeTokens(tokens: SessionTokens): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: ACCESS_MAX_AGE });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
}

export async function clearTokens(): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, '', { ...base, maxAge: 0 });
  jar.set(REFRESH_COOKIE, '', { ...base, maxAge: 0 });
}
