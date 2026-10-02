import { cookies } from 'next/headers';
import { AppShell } from '@/components/layout/AppShell';
import { SessionProvider } from '@/providers/SessionProvider';
import { SessionGuard } from '@/providers/SessionGuard';
import { requireUser } from '@/lib/auth/guards.server';
import { NotificationBell } from '@/components/layout/NotificationBell';
import type { UserRole } from '@/lib/api/types';

/** Everything behind a sign-in renders inside this frame. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const jar = await cookies();
  const collapsed = jar.get('gym_sidebar')?.value === 'collapsed';

  return (
    <SessionProvider user={user}>
      <SessionGuard />
      <AppShell
        role={user.role as UserRole}
        initialCollapsed={collapsed}
        notifications={<NotificationBell />}
      >
        {children}
      </AppShell>
    </SessionProvider>
  );
}
