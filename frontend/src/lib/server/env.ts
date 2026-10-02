import 'server-only';

/**
 * Server-side configuration. Read once at module load so a missing value fails
 * at boot rather than on the first request that happens to need it.
 */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value.replace(/\/+$/, '');
}

export const serverEnv = {
  /** Where the NestJS API lives, as seen from the Next.js server. */
  apiUrl: required('API_URL', process.env.API_URL || process.env.NEXT_PUBLIC_API_URL),
  /** Cookies are only marked Secure over HTTPS; local http development needs them without. */
  secureCookies: process.env.NODE_ENV === 'production' && process.env.COOKIE_INSECURE !== 'true',
  requestTimeoutMs: Number(process.env.API_TIMEOUT_MS ?? 20000),
} as const;
