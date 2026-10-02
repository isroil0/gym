'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { homeFor } from '@/lib/auth/roles';
import { useSession } from './SessionProvider';
import type { User, UserRole } from '@/lib/api/types';

/**
 * Keeps the open page honest about who is actually signed in.
 *
 * Sessions live in cookies, which belong to the browser rather than to a
 * tab. Signing in as somebody else in a second tab silently replaces the
 * first tab's identity: the page carries on showing an administrator's
 * navigation while every request it makes is now a member's, and the screen
 * fills with refusals it cannot explain.
 *
 * So: watch for the one thing that proves it. A 401 means the session is
 * gone; a 403 on a page this role should never have reached means the
 * identity changed underneath. Either way, confirm with the server and move
 * the reader somewhere that makes sense, rather than leaving them looking at
 * "something went wrong" on a dashboard they are no longer entitled to.
 */
export function SessionGuard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role } = useSession();
  // One correction per mount. Without this a burst of parallel 403s — a
  // dashboard fires six at once — would each try to navigate.
  const correcting = useRef(false);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(async (event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      const error = event.action.error;
      if (!(error instanceof ApiError)) return;
      if (!error.isUnauthorized && !error.isForbidden) return;
      if (correcting.current) return;
      correcting.current = true;

      if (error.isUnauthorized) {
        queryClient.clear();
        router.replace('/login');
        router.refresh();
        return;
      }

      // A 403 is ambiguous on its own: it can simply mean this account may
      // not do this one thing. Ask who the server thinks we are, and only
      // act if that disagrees with the page we are rendering.
      try {
        const actual = await api.get<User>('auth/me');
        if ((actual.role as UserRole) !== role) {
          queryClient.clear();
          router.replace(homeFor(actual.role as UserRole));
          router.refresh();
          return;
        }
      } catch {
        queryClient.clear();
        router.replace('/login');
        router.refresh();
        return;
      }

      // Same role, ordinary refusal. Let the screen show its error.
      correcting.current = false;
    });

    return unsubscribe;
  }, [queryClient, role, router]);

  return null;
}
