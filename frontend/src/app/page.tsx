import { redirect } from 'next/navigation';
import { getCurrentUser, hasSession } from '@/lib/auth/session.server';
import { homeFor } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/api/types';

/**
 * The root sends each role to the area that belongs to it.
 *
 * A reader whose access token has expired but whose refresh cookie is still
 * good is not signed out — middleware would send them straight back here from
 * the sign-in page. They go through the restore route, which settles which of
 * the two it is.
 */
export default async function Index() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role as UserRole));
  redirect((await hasSession()) ? '/api/session/restore' : '/login');
}
