import { applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

/**
 * The tighter rate limit for credential endpoints.
 *
 * Read straight from the environment because `@Throttle()` is evaluated when
 * the class is defined, before the validated config exists. The same variables
 * are validated at boot by the env schema, which remains the authority on
 * whether they are sane; the defaults here only have to match.
 *
 * Note that a *single* throttler is registered globally. Registering a second
 * named one would apply it to every route as well, not only the routes that
 * name it — which would throttle ordinary traffic at the credential limit.
 * Overriding the default on just these handlers is what scopes it.
 */
function intFromEnv(key: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const AUTH_THROTTLE_LIMIT = intFromEnv('AUTH_RATE_LIMIT_MAX', 10);
export const AUTH_THROTTLE_TTL_MS = intFromEnv('AUTH_RATE_LIMIT_WINDOW_SECONDS', 60) * 1000;

/**
 * Applies the credential rate limit to one endpoint.
 *
 * The counter is per route, so exhausting the login limit does not also lock
 * out password reset — and neither affects ordinary traffic.
 */
export const ThrottleCredentials = () =>
  applyDecorators(Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } }));
