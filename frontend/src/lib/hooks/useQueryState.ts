'use client';

import { useCallback, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * List state that lives in the URL.
 *
 * Search, filters and the page number belong in the address bar: a staff
 * member can bookmark "members in debt", send a colleague the exact view they
 * are looking at, and the back button does what everyone expects. Keeping it
 * in component state would throw all of that away.
 */
export function useQueryState<T extends Record<string, string>>(defaults: T) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const state = useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const value = searchParams.get(String(key));
      if (value !== null) out[key] = value as T[keyof T];
    }
    return out;
  }, [searchParams, defaults]);

  const set = useCallback(
    (updates: Partial<T>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '' || value === defaults[key]) params.delete(key);
        else params.set(key, String(value));
      }
      // Any change to what is being looked at puts you back on page one;
      // staying on page 7 of a different result set is never what was meant.
      if (!('page' in updates)) params.delete('page');

      const search = params.toString();
      // replace, not push: a filter tweak should not need six back presses
      // to escape.
      startTransition(() => router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false }));
    },
    [router, pathname, searchParams, defaults],
  );

  const clear = useCallback(() => {
    startTransition(() => router.replace(pathname, { scroll: false }));
  }, [router, pathname]);

  return { state, set, clear, isPending };
}
