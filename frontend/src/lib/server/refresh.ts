import 'server-only';
import { apiPath, callBackend } from './backend';
import { type SessionTokens } from './session';

type RefreshOutcome =
  | { ok: true; tokens: SessionTokens }
  | { ok: false; status: number };

/**
 * In-flight refreshes, keyed by the refresh token being spent.
 *
 * This matters more than it looks. Refresh tokens rotate, and the backend
 * treats the replay of an already-rotated token as theft by revoking every
 * session the account has. Two tabs refreshing at the same moment would
 * therefore log the user out everywhere. Collapsing concurrent refreshes onto
 * one promise means the token is spent exactly once.
 *
 * Scope is this server process. A multi-instance deployment behind a load
 * balancer would need a shared lock; see the deployment notes in the README.
 */
const inFlight = new Map<string, Promise<RefreshOutcome>>();

export function refreshTokens(refreshToken: string): Promise<RefreshOutcome> {
  const existing = inFlight.get(refreshToken);
  if (existing) return existing;

  const attempt = (async (): Promise<RefreshOutcome> => {
    try {
      const result = await callBackend(apiPath('auth/refresh'), {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });

      const body = result.body as Partial<SessionTokens> | null;
      if (result.status === 200 && body?.accessToken && body?.refreshToken) {
        return {
          ok: true,
          tokens: { accessToken: body.accessToken, refreshToken: body.refreshToken },
        };
      }
      return { ok: false, status: result.status };
    } catch {
      return { ok: false, status: 0 };
    } finally {
      // Freed on the next tick so callers that joined this promise all read
      // the same result before a fresh attempt can start.
      setTimeout(() => inFlight.delete(refreshToken), 0);
    }
  })();

  inFlight.set(refreshToken, attempt);
  return attempt;
}
