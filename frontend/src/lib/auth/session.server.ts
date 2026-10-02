import 'server-only';
import { cache } from 'react';
import { apiPath, callBackend } from '@/lib/server/backend';
import { readTokens } from '@/lib/server/session';
import type { User } from '@/lib/api/types';

/**
 * The signed-in user, as the server sees it.
 *
 * Wrapped in `cache` so a layout and the page inside it share one call
 * per request rather than asking the API twice.
 *
 * Deliberately does not refresh an expired access token: a page render is not
 * the place to spend a rotating credential. If the token has expired the
 * reader is treated as signed out, and the next client call through the proxy
 * refreshes properly.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const { accessToken } = await readTokens();
  if (!accessToken) return null;

  try {
    const result = await callBackend(apiPath('auth/me'), { accessToken });
    if (result.status !== 200) return null;
    return result.body as User;
  } catch {
    return null;
  }
});

/** True when a refresh token exists, i.e. the reader has a session to restore. */
export async function hasSession(): Promise<boolean> {
  const { refreshToken } = await readTokens();
  return Boolean(refreshToken);
}
