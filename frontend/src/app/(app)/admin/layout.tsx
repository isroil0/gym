import { requireRole } from '@/lib/auth/guards.server';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole('ADMIN');
  return <>{children}</>;
}
