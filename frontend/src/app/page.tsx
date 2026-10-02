import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session.server';
import { homeFor } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/api/types';

/** The root sends each role to the area that belongs to it. */
export default async function Index() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role as UserRole) : '/login');
}
