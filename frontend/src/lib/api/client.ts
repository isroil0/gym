'use client';

import { ApiError, networkError, type ApiErrorBody } from './errors';

/**
 * The browser's view of the API.
 *
 * Calls go to this application's own `/api/proxy`, which attaches the access
 * token from an httpOnly cookie and refreshes it when it expires. No token
 * ever exists in a place that page script could reach.
 */
const PROXY_BASE = '/api/proxy';

export type QueryValue = string | number | boolean | null | undefined;

export function toSearchParams(query?: Record<string, QueryValue | QueryValue[]>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') params.append(key, String(item));
      }
    } else {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export interface RequestOptions {
  query?: Record<string, QueryValue | QueryValue[]>;
  body?: unknown;
  signal?: AbortSignal;
  /** Sent through to the backend so the audit trail keeps one correlation id. */
  requestId?: string;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${PROXY_BASE}/${path.replace(/^\/+/, '')}${toSearchParams(options.query)}`;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.requestId) headers['x-request-id'] = options.requestId;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw networkError(cause);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    if (!response.ok) throw new ApiError(response.status, null);
    return undefined as T;
  }

  let parsed: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) throw new ApiError(response.status, parsed as ApiErrorBody | null);
  return parsed as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...options, body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PATCH', path, { ...options, body: body ?? {} }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PUT', path, { ...options, body: body ?? {} }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, options),
};

/** Sign in. Tokens are stored as httpOnly cookies by the route handler. */
export async function loginRequest(email: string, password: string): Promise<{ user: unknown }> {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json().catch(() => null)) as ApiErrorBody | { user: unknown } | null;
  if (!response.ok) throw new ApiError(response.status, body as ApiErrorBody | null);
  return body as { user: unknown };
}

export async function logoutRequest(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
}
