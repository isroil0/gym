import { vi } from 'vitest';

/** Router and pathname stubs, shared by every component test. */
export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

export let currentPathname = '/admin';
export let currentSearch = new URLSearchParams();

export function setPathname(pathname: string) {
  currentPathname = pathname;
}

export function setSearch(search: string) {
  currentSearch = new URLSearchParams(search);
}

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => currentPathname,
  useSearchParams: () => currentSearch,
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
