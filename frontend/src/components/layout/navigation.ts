import type { UserRole } from '@/lib/api/types';

export interface NavItem {
  /** Key into the `navigation` message namespace. */
  key: string;
  href: string;
  icon: string;
  /** Matched as a prefix so a detail page keeps its parent highlighted. */
  match?: string;
}

export interface NavSection {
  /** Key into `navigation.sections`, or null for an unlabelled first group. */
  key: string | null;
  items: NavItem[];
}

/**
 * What each role sees in the sidebar.
 *
 * Mirrors the areas the backend actually lets that role reach. Accounting is
 * administrator-only, trainers get their own members and nobody else's, and
 * members get only their own records.
 */
export const NAVIGATION: Record<UserRole, NavSection[]> = {
  ADMIN: [
    {
      key: null,
      items: [{ key: 'dashboard', href: '/admin', icon: 'dashboard' }],
    },
    {
      key: 'operations',
      items: [
        { key: 'members', href: '/admin/members', icon: 'members' },
        { key: 'trainers', href: '/admin/trainers', icon: 'trainers' },
        { key: 'memberships', href: '/admin/memberships', icon: 'memberships' },
        { key: 'attendance', href: '/admin/attendance', icon: 'attendance' },
      ],
    },
    {
      key: 'finance',
      items: [
        { key: 'payments', href: '/admin/payments', icon: 'payments' },
        { key: 'accounting', href: '/admin/accounting', icon: 'accounting' },
        { key: 'reports', href: '/admin/reports', icon: 'reports' },
      ],
    },
    {
      key: 'system',
      items: [
        { key: 'notifications', href: '/admin/notifications', icon: 'notifications' },
        { key: 'audit', href: '/admin/audit', icon: 'audit' },
        { key: 'settings', href: '/admin/settings', icon: 'settings' },
      ],
    },
  ],

  TRAINER: [
    {
      key: null,
      items: [{ key: 'dashboard', href: '/trainer', icon: 'dashboard' }],
    },
    {
      key: 'training',
      items: [
        { key: 'myMembers', href: '/trainer/members', icon: 'members' },
        { key: 'workoutPlans', href: '/trainer/workout-plans', icon: 'workouts' },
        { key: 'sessions', href: '/trainer/sessions', icon: 'sessions' },
        { key: 'progress', href: '/trainer/progress', icon: 'progress' },
      ],
    },
    {
      key: 'system',
      items: [
        { key: 'notifications', href: '/trainer/notifications', icon: 'notifications' },
        { key: 'profile', href: '/trainer/profile', icon: 'profile' },
      ],
    },
  ],

  MEMBER: [
    {
      key: null,
      items: [
        { key: 'home', href: '/me', icon: 'home' },
        { key: 'qrCard', href: '/me/card', icon: 'qr' },
      ],
    },
    {
      key: 'training',
      items: [
        { key: 'workout', href: '/me/workout', icon: 'workouts' },
        { key: 'progress', href: '/me/progress', icon: 'progress' },
        { key: 'myTrainer', href: '/me/trainer', icon: 'trainers' },
      ],
    },
    {
      key: 'main',
      items: [
        { key: 'myMembership', href: '/me/membership', icon: 'memberships' },
        { key: 'attendance', href: '/me/attendance', icon: 'attendance' },
        { key: 'payments', href: '/me/payments', icon: 'payments' },
        { key: 'profile', href: '/me/profile', icon: 'profile' },
      ],
    },
  ],
};

/**
 * The four destinations that live in the mobile tab bar, plus "more".
 *
 * Chosen by what somebody actually opens on a phone: a member wants their
 * card at the door, staff want today's desk work.
 */
export const MOBILE_PRIMARY: Record<UserRole, NavItem[]> = {
  ADMIN: [
    { key: 'dashboard', href: '/admin', icon: 'dashboard' },
    { key: 'members', href: '/admin/members', icon: 'members' },
    { key: 'attendance', href: '/admin/attendance', icon: 'attendance' },
    { key: 'payments', href: '/admin/payments', icon: 'payments' },
  ],
  TRAINER: [
    { key: 'dashboard', href: '/trainer', icon: 'dashboard' },
    { key: 'myMembers', href: '/trainer/members', icon: 'members' },
    { key: 'sessions', href: '/trainer/sessions', icon: 'sessions' },
    { key: 'workoutPlans', href: '/trainer/workout-plans', icon: 'workouts' },
  ],
  MEMBER: [
    { key: 'home', href: '/me', icon: 'home' },
    { key: 'qrCard', href: '/me/card', icon: 'qr' },
    { key: 'workout', href: '/me/workout', icon: 'workouts' },
    { key: 'myMembership', href: '/me/membership', icon: 'memberships' },
  ],
};

/** True when `pathname` is this item or something beneath it. */
export function isActive(item: NavItem, pathname: string): boolean {
  const base = item.match ?? item.href;
  if (pathname === base) return true;
  // A bare area root ("/admin") must not light up for every page under it.
  const isAreaRoot = base.split('/').filter(Boolean).length === 1;
  return isAreaRoot ? false : pathname.startsWith(`${base}/`);
}

export function allItems(role: UserRole): NavItem[] {
  return NAVIGATION[role].flatMap((section) => section.items);
}
