import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser } from './session.server';
import { homeFor } from './roles';
import type { User, UserRole } from '@/lib/api/types';

/**
 * Requires a signed-in user, or sends the visitor to the sign-in page.
 *
 * This is the second of three checks, not the only one: middleware does a
 * cheap cookie test first, and the backend enforces the real authorization on
 * every request. Hiding a page here is a convenience; it is not the control.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Requires one of the given roles.
 *
 * A trainer who follows a bookmarked admin link is sent to their own
 * dashboard rather than shown a dead end — being in the wrong place is
 * usually an accident, not an attempt.
 */
export async function requireRole(...roles: UserRole[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role as UserRole)) redirect(homeFor(user.role as UserRole));
  return user;
}
