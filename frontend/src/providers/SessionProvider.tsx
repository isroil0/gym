'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { logoutRequest } from '@/lib/api/client';
import type { User, UserRole } from '@/lib/api/types';

interface SessionContextValue {
  user: User;
  role: UserRole;
  /** Convenience predicates, so screens read as prose. */
  isAdmin: boolean;
  isTrainer: boolean;
  isMember: boolean;
  displayName: string;
  initials: string;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

/** The session when there may not be one — unauthenticated pages. */
export function useOptionalSession(): SessionContextValue | null {
  return useContext(SessionContext);
}

export function SessionProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const logout = useCallback(async () => {
    await logoutRequest();
    // Everything cached belonged to the person who just left.
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  }, [queryClient, router]);

  const value = useMemo<SessionContextValue>(() => {
    const role = user.role as UserRole;
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    const initials =
      [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase() ||
      user.email.slice(0, 2).toUpperCase();

    return {
      user,
      role,
      isAdmin: role === 'ADMIN',
      isTrainer: role === 'TRAINER',
      isMember: role === 'MEMBER',
      displayName,
      initials,
      logout,
    };
  }, [user, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
