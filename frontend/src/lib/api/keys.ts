/**
 * One place where every cache key is spelled.
 *
 * Keys are hierarchical so a mutation can invalidate a whole area —
 * `keys.members.all` drops every member list and detail — without each call
 * site having to remember the shape of the others.
 */
export const keys = {
  session: ['session'] as const,

  members: {
    all: ['members'] as const,
    list: (query: unknown) => ['members', 'list', query] as const,
    detail: (id: string) => ['members', 'detail', id] as const,
    me: ['members', 'me'] as const,
    mine: ['members', 'mine'] as const,
  },

  trainers: {
    all: ['trainers'] as const,
    list: (query: unknown) => ['trainers', 'list', query] as const,
    detail: (id: string) => ['trainers', 'detail', id] as const,
    me: ['trainers', 'me'] as const,
    members: (id: string) => ['trainers', id, 'members'] as const,
  },

  plans: {
    all: ['membership-plans'] as const,
    list: (query: unknown) => ['membership-plans', 'list', query] as const,
    detail: (id: string) => ['membership-plans', 'detail', id] as const,
  },

  memberships: {
    all: ['memberships'] as const,
    list: (query: unknown) => ['memberships', 'list', query] as const,
    detail: (id: string) => ['memberships', 'detail', id] as const,
    me: ['memberships', 'me'] as const,
  },

  payments: {
    all: ['payments'] as const,
    list: (query: unknown) => ['payments', 'list', query] as const,
    detail: (id: string) => ['payments', 'detail', id] as const,
    me: ['payments', 'me'] as const,
  },

  billing: {
    all: ['billing'] as const,
    member: (id: string) => ['billing', 'member', id] as const,
    me: ['billing', 'me'] as const,
    outstanding: (query: unknown) => ['billing', 'outstanding', query] as const,
  },

  accounting: {
    all: ['accounting'] as const,
    entries: (query: unknown) => ['accounting', 'entries', query] as const,
    entry: (id: string) => ['accounting', 'entry', id] as const,
    summary: (query: unknown) => ['accounting', 'summary', query] as const,
    daily: (query: unknown) => ['accounting', 'daily', query] as const,
    monthly: (query: unknown) => ['accounting', 'monthly', query] as const,
    categories: (query: unknown) => ['accounting', 'categories', query] as const,
  },

  attendance: {
    all: ['attendance'] as const,
    list: (query: unknown) => ['attendance', 'list', query] as const,
    today: ['attendance', 'today'] as const,
    me: (query: unknown) => ['attendance', 'me', query] as const,
  },

  cards: {
    all: ['membership-cards'] as const,
    me: ['membership-cards', 'me'] as const,
    member: (id: string) => ['membership-cards', 'member', id] as const,
  },

  workouts: {
    all: ['workout-plans'] as const,
    list: (query: unknown) => ['workout-plans', 'list', query] as const,
    detail: (id: string) => ['workout-plans', 'detail', id] as const,
    me: ['workout-plans', 'me'] as const,
  },

  measurements: {
    all: ['measurements'] as const,
    list: (query: unknown) => ['measurements', 'list', query] as const,
    me: (query: unknown) => ['measurements', 'me', query] as const,
    progressMe: ['measurements', 'progress', 'me'] as const,
    progress: (memberId: string) => ['measurements', 'progress', memberId] as const,
  },

  sessions: {
    all: ['training-sessions'] as const,
    list: (query: unknown) => ['training-sessions', 'list', query] as const,
    detail: (id: string) => ['training-sessions', 'detail', id] as const,
    me: (query: unknown) => ['training-sessions', 'me', query] as const,
    schedule: (trainerId: string, query: unknown) =>
      ['training-sessions', 'schedule', trainerId, query] as const,
  },

  dashboards: {
    admin: ['dashboard', 'admin'] as const,
    trainer: ['dashboard', 'trainer'] as const,
    member: ['dashboard', 'member'] as const,
  },

  reports: {
    all: ['reports'] as const,
    one: (name: string, query: unknown) => ['reports', name, query] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (query: unknown) => ['notifications', 'list', query] as const,
    unread: ['notifications', 'unread-count'] as const,
  },

  audit: {
    all: ['audit'] as const,
    logs: (query: unknown) => ['audit', 'logs', query] as const,
    permissions: ['audit', 'permissions'] as const,
  },
} as const;
