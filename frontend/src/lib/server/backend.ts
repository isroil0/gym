import 'server-only';
import { serverEnv } from './env';

export interface BackendResponse {
  status: number;
  body: unknown;
  /** Raw text, kept for the rare non-JSON reply so nothing is silently lost. */
  raw: string;
}

/**
 * One call to the NestJS API from the Next.js server.
 *
 * Never throws for an HTTP error status — the caller decides what a 401 or a
 * 422 means. It throws only when the request could not be made at all.
 */
export async function callBackend(
  path: string,
  init: {
    method?: string;
    body?: string | undefined;
    accessToken?: string | undefined;
    headers?: Record<string, string>;
    search?: string;
    signal?: AbortSignal;
  } = {},
): Promise<BackendResponse> {
  const url = `${serverEnv.apiUrl}${path}${init.search ?? ''}`;

  const headers: Record<string, string> = {
    accept: 'application/json',
    ...init.headers,
  };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.accessToken) headers.authorization = `Bearer ${init.accessToken}`;

  const timeout = AbortSignal.timeout(serverEnv.requestTimeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
    signal,
    // Always hit the API: this data is per-user and changes constantly.
    cache: 'no-store',
  });

  const raw = await response.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }

  return { status: response.status, body, raw };
}

/** The API path for a versioned endpoint, e.g. "members" → "/api/v1/members". */
export function apiPath(path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `/api/v1/${clean}`;
}
