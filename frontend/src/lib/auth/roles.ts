import type { UserRole } from '@/lib/api/types';

/**
 * Where each role lands after signing in, and what it is allowed to see in
 * this client.
 *
 * This is navigation, not security. The backend enforces authorization on
 * every request; hiding a link the server would refuse anyway is a courtesy
 * to the reader, not a control.
 */
export const HOME_BY_ROLE: Record<UserRole, string> = {
  ADMIN: '/admin',
  TRAINER: '/trainer',
  MEMBER: '/me',
};

/** The URL prefix each role owns. */
export const AREA_BY_ROLE: Record<UserRole, string> = {
  ADMIN: '/admin',
  TRAINER: '/trainer',
  MEMBER: '/me',
};

export function homeFor(role: UserRole | undefined): string {
  return role ? HOME_BY_ROLE[role] : '/login';
}

/** True when a path belongs to the area this role is allowed to browse. */
export function canEnter(role: UserRole, pathname: string): boolean {
  const area = AREA_BY_ROLE[role];
  return pathname === area || pathname.startsWith(`${area}/`);
}

export function roleOwning(pathname: string): UserRole | null {
  for (const role of Object.keys(AREA_BY_ROLE) as UserRole[]) {
    if (canEnter(role, pathname)) return role;
  }
  return null;
}
