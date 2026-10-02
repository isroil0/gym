import { vi } from 'vitest';
import type * as ApiClient from '@/lib/api/client';

/**
 * Stubs the API client with a path-to-response table.
 *
 * Keyed by the path the feature code asks for, so a test reads as the set of
 * endpoints a screen depends on — and a screen that starts calling something
 * new fails loudly here rather than silently returning undefined.
 */
export const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>();
  return { ...actual, api: apiMock };
});

export function respondWith(table: Record<string, unknown>) {
  apiMock.get.mockImplementation((path: string) => {
    if (path in table) return Promise.resolve(table[path]);
    const prefix = Object.keys(table).find((key) => path.startsWith(key));
    if (prefix) return Promise.resolve(table[prefix]);
    return Promise.reject(new Error(`Unstubbed GET ${path}`));
  });
}
