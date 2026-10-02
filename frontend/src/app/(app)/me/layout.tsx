import { requireRole } from '@/lib/auth/guards.server';

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireRole('MEMBER');
  return <>{children}</>;
}
