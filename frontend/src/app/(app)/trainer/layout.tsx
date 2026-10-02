import { requireRole } from '@/lib/auth/guards.server';

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  await requireRole('TRAINER');
  return <>{children}</>;
}
