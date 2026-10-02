import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import {
  bearer,
  isoDaysFromToday,
  seedAndLogin,
  seedMemberProfile,
  seedMembership,
  seedPlan,
  seedTrainerProfile,
  type SignedInUser,
} from './utils/auth';

/**
 * PHASE 10 — the permission matrix, tested per role.
 *
 * The per-phase suites each checked their own corner. This one takes the whole
 * surface at once and asks, for each role in turn: what may you reach, what may
 * you not, and does a refusal ever tell you something you should not know.
 *
 * A route is listed here as ALLOWED only if the role is genuinely meant to use
 * it; everything else must be refused with 401, 403 or 404 — never served.
 */

type Method = 'get' | 'post' | 'patch' | 'delete';
interface Route {
  method: Method;
  path: string;
  body?: Record<string, unknown>;
}

const PERIOD = `from=${isoDaysFromToday(-30)}&to=${isoDaysFromToday(0)}`;
const ABSENT = '0b5f8a2e-0000-4000-8000-000000000000';

describe('ACCEPTANCE: permissions, by role', () => {
  let ctx: TestContext;
  let server: App;

  let admin: SignedInUser;
  let trainer: Awaited<ReturnType<typeof seedTrainerProfile>>;
  let member: Awaited<ReturnType<typeof seedMemberProfile>>;
  let strangerTrainer: Awaited<ReturnType<typeof seedTrainerProfile>>;
  let strangerMember: Awaited<ReturnType<typeof seedMemberProfile>>;
  let membershipId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDatabase(ctx);

    admin = await seedAndLogin(ctx, server, { role: UserRole.ADMIN });
    trainer = await seedTrainerProfile(ctx, server, { email: 'tina@gym.test' });
    member = await seedMemberProfile(ctx, server, {
      email: 'mia@gym.test',
      assignedTrainerId: trainer.trainerId,
    });
    strangerTrainer = await seedTrainerProfile(ctx, server, { email: 'sam@gym.test' });
    strangerMember = await seedMemberProfile(ctx, server, { email: 'nora@gym.test' });

    const plan = await seedPlan(ctx, { name: 'Monthly', price: '49.99' });
    const membership = await seedMembership(ctx, member.memberId, plan.id);
    membershipId = membership.id;
  });

  /** Issues the request and returns its status. */
  const call = async (route: Route, token?: string): Promise<number> => {
    let req = request(server)[route.method](route.path);
    if (token) req = req.set(...bearer(token));
    const res = await req.send(route.body ?? {});
    return res.status;
  };

  const ALLOWED = (status: number) => status >= 200 && status < 300;
  const REFUSED = (status: number) => [401, 403, 404].includes(status);

  // -------------------------------------------------------------------------
  // ADMIN
  // -------------------------------------------------------------------------

  describe('ADMIN', () => {
    const reads = (): Route[] => [
      { method: 'get', path: '/api/v1/auth/me' },
      { method: 'get', path: '/api/v1/users' },
      { method: 'get', path: '/api/v1/members' },
      { method: 'get', path: '/api/v1/trainers' },
      { method: 'get', path: '/api/v1/membership-plans' },
      { method: 'get', path: '/api/v1/memberships' },
      { method: 'get', path: '/api/v1/payments' },
      { method: 'get', path: '/api/v1/billing/outstanding' },
      { method: 'get', path: '/api/v1/accounting/entries' },
      { method: 'get', path: '/api/v1/accounting/expense-categories' },
      { method: 'get', path: `/api/v1/accounting/summary?${PERIOD}` },
      { method: 'get', path: '/api/v1/attendance' },
      { method: 'get', path: '/api/v1/attendance/today' },
      { method: 'get', path: '/api/v1/workout-plans' },
      { method: 'get', path: '/api/v1/measurements' },
      { method: 'get', path: '/api/v1/training-sessions' },
      { method: 'get', path: '/api/v1/dashboard/admin' },
      { method: 'get', path: `/api/v1/reports/revenue?${PERIOD}` },
      { method: 'get', path: `/api/v1/reports/trainer-stats?${PERIOD}` },
      { method: 'get', path: '/api/v1/reports/unpaid-balances' },
      { method: 'get', path: '/api/v1/audit/logs' },
      { method: 'get', path: '/api/v1/audit/permissions' },
      { method: 'get', path: '/api/v1/notifications' },
    ];

    it.each(
      reads().map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const),
    )('may read %s', async (_label, route) => {
      expect(ALLOWED(await call(route, admin.accessToken))).toBe(true);
    });

    it('may reach any member, trainer, membership or payment by id', async () => {
      for (const path of [
        `/api/v1/members/${member.memberId}`,
        `/api/v1/members/${strangerMember.memberId}`,
        `/api/v1/trainers/${trainer.trainerId}`,
        `/api/v1/trainers/${strangerTrainer.trainerId}`,
        `/api/v1/memberships/${membershipId}`,
        `/api/v1/billing/members/${strangerMember.memberId}`,
      ]) {
        expect(ALLOWED(await call({ method: 'get', path }, admin.accessToken))).toBe(true);
      }
    });

    it('may perform every administrative write', async () => {
      const writes: Route[] = [
        {
          method: 'post',
          path: '/api/v1/membership-plans',
          body: { name: 'New plan', durationDays: 7, price: 10 },
        },
        {
          method: 'post',
          path: '/api/v1/trainers',
          body: {
            email: 'new-t@gym.test',
            password: 'TrainerPass1',
            firstName: 'A',
            lastName: 'B',
          },
        },
        {
          method: 'post',
          path: '/api/v1/members',
          body: { email: 'new-m@gym.test', password: 'MemberPass1', firstName: 'C', lastName: 'D' },
        },
        {
          method: 'post',
          path: '/api/v1/payments',
          body: { memberId: member.memberId, membershipId, amount: 10, method: 'CASH' },
        },
        {
          method: 'post',
          path: '/api/v1/attendance/check-in',
          body: { memberId: member.memberId },
        },
        {
          method: 'patch',
          path: `/api/v1/members/${member.memberId}/trainer`,
          body: { trainerId: trainer.trainerId },
        },
        {
          method: 'post',
          path: '/api/v1/notifications/announcements',
          body: { title: 'Notice', body: 'Details to follow.', roles: ['MEMBER'] },
        },
        { method: 'post', path: '/api/v1/notifications/run-reminders', body: {} },
      ];

      for (const route of writes) {
        const status = await call(route, admin.accessToken);
        expect(ALLOWED(status)).toBe(true);
      }
    });

    it('is still refused the role-specific dashboards', async () => {
      // Not a privilege question: an administrator has no trainer or member
      // profile, so those screens are not theirs to read.
      expect(
        await call({ method: 'get', path: '/api/v1/dashboard/trainer' }, admin.accessToken),
      ).toBe(403);
      expect(
        await call({ method: 'get', path: '/api/v1/dashboard/member' }, admin.accessToken),
      ).toBe(403);
      expect(await call({ method: 'get', path: '/api/v1/members/me' }, admin.accessToken)).toBe(
        403,
      );
    });

    it('cannot edit or delete the audit trail', async () => {
      for (const route of [
        { method: 'post' as const, path: '/api/v1/audit/logs' },
        { method: 'patch' as const, path: `/api/v1/audit/logs/${ABSENT}` },
        { method: 'delete' as const, path: `/api/v1/audit/logs/${ABSENT}` },
      ]) {
        expect(await call(route, admin.accessToken)).toBe(404);
      }
    });

    it("cannot read or dismiss another user's notifications", async () => {
      await request(server)
        .post('/api/v1/notifications/announcements')
        .set(...bearer(admin.accessToken))
        .send({ title: 'Private', body: 'For the member only.', userIds: [member.user.id] })
        .expect(201);

      const theirs = await ctx.prisma.notification.findFirstOrThrow({
        where: { recipientId: member.user.id },
      });

      expect(
        await call(
          { method: 'post', path: `/api/v1/notifications/${theirs.id}/read` },
          admin.accessToken,
        ),
      ).toBe(404);
      expect(
        await call(
          { method: 'delete', path: `/api/v1/notifications/${theirs.id}` },
          admin.accessToken,
        ),
      ).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // TRAINER
  // -------------------------------------------------------------------------

  describe('TRAINER', () => {
    const allowed = (): Route[] => [
      { method: 'get', path: '/api/v1/auth/me' },
      { method: 'get', path: '/api/v1/trainers/me' },
      { method: 'get', path: '/api/v1/trainers/me/members' },
      { method: 'get', path: '/api/v1/membership-plans' },
      { method: 'get', path: '/api/v1/members' },
      { method: 'get', path: '/api/v1/memberships' },
      { method: 'get', path: '/api/v1/attendance' },
      { method: 'get', path: '/api/v1/workout-plans' },
      { method: 'get', path: '/api/v1/measurements' },
      { method: 'get', path: '/api/v1/training-sessions' },
      { method: 'get', path: '/api/v1/training-sessions/me' },
      { method: 'get', path: '/api/v1/dashboard/trainer' },
      { method: 'get', path: '/api/v1/notifications' },
    ];

    const forbidden = (): Route[] => [
      { method: 'get', path: '/api/v1/users' },
      { method: 'get', path: '/api/v1/trainers' },
      { method: 'get', path: '/api/v1/payments' },
      { method: 'get', path: '/api/v1/billing/outstanding' },
      { method: 'get', path: '/api/v1/accounting/entries' },
      { method: 'get', path: `/api/v1/accounting/summary?${PERIOD}` },
      { method: 'get', path: '/api/v1/attendance/today' },
      { method: 'get', path: '/api/v1/dashboard/admin' },
      { method: 'get', path: '/api/v1/dashboard/member' },
      { method: 'get', path: `/api/v1/reports/revenue?${PERIOD}` },
      { method: 'get', path: '/api/v1/reports/unpaid-balances' },
      { method: 'get', path: '/api/v1/audit/logs' },
      { method: 'get', path: '/api/v1/audit/permissions' },
      { method: 'get', path: '/api/v1/members/me' },
      { method: 'get', path: '/api/v1/membership-cards/me' },
      {
        method: 'post',
        path: '/api/v1/members',
        body: { email: 'x@gym.test', password: 'MemberPass1', firstName: 'A', lastName: 'B' },
      },
      {
        method: 'post',
        path: '/api/v1/trainers',
        body: { email: 'y@gym.test', password: 'TrainerPass1', firstName: 'A', lastName: 'B' },
      },
      {
        method: 'post',
        path: '/api/v1/membership-plans',
        body: { name: 'Nope', durationDays: 7, price: 1 },
      },
      { method: 'post', path: '/api/v1/memberships', body: { memberId: '', planId: '' } },
      {
        method: 'post',
        path: '/api/v1/payments',
        body: { memberId: '', amount: 1, method: 'CASH' },
      },
      { method: 'post', path: '/api/v1/attendance/check-in', body: { memberId: '' } },
      { method: 'post', path: '/api/v1/accounting/entries', body: {} },
      {
        method: 'post',
        path: '/api/v1/notifications/announcements',
        body: { title: 'xx', body: 'Details.', roles: ['MEMBER'] },
      },
      { method: 'post', path: '/api/v1/notifications/run-reminders', body: {} },
    ];

    it.each(
      allowed().map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const),
    )('may reach %s', async (_label, route) => {
      expect(ALLOWED(await call(route, trainer.accessToken))).toBe(true);
    });

    it.each(
      forbidden().map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const),
    )('is refused %s', async (_label, route) => {
      expect(REFUSED(await call(route, trainer.accessToken))).toBe(true);
    });

    it('reaches their assigned member, and only them', async () => {
      expect(
        ALLOWED(
          await call(
            { method: 'get', path: `/api/v1/members/${member.memberId}` },
            trainer.accessToken,
          ),
        ),
      ).toBe(true);

      // Not assigned: reported absent rather than forbidden, so ids cannot be probed.
      expect(
        await call(
          { method: 'get', path: `/api/v1/members/${strangerMember.memberId}` },
          trainer.accessToken,
        ),
      ).toBe(404);
      expect(
        await call(
          {
            method: 'get',
            path: `/api/v1/measurements/progress/members/${strangerMember.memberId}`,
          },
          trainer.accessToken,
        ),
      ).toBe(404);
    });

    it('may write training data for their member but not for a stranger', async () => {
      expect(
        ALLOWED(
          await call(
            {
              method: 'post',
              path: '/api/v1/workout-plans',
              body: { memberId: member.memberId, name: 'Mine' },
            },
            trainer.accessToken,
          ),
        ),
      ).toBe(true);

      expect(
        await call(
          {
            method: 'post',
            path: '/api/v1/workout-plans',
            body: { memberId: strangerMember.memberId, name: 'Theirs' },
          },
          trainer.accessToken,
        ),
      ).toBe(404);
    });

    it('sees no money, even for their own member', async () => {
      const payment = await request(server)
        .post('/api/v1/payments')
        .set(...bearer(admin.accessToken))
        .send({ memberId: member.memberId, membershipId, amount: 10, method: 'CASH' })
        .expect(201);

      expect(
        await call(
          { method: 'get', path: `/api/v1/payments/${payment.body.id}` },
          trainer.accessToken,
        ),
      ).toBe(404);
      expect(await call({ method: 'get', path: '/api/v1/payments' }, trainer.accessToken)).toBe(
        403,
      );
    });

    it("may read their own member's billing summary, as a renewal conversation needs", async () => {
      expect(
        ALLOWED(
          await call(
            { method: 'get', path: `/api/v1/billing/members/${member.memberId}` },
            trainer.accessToken,
          ),
        ),
      ).toBe(true);
      expect(
        await call(
          { method: 'get', path: `/api/v1/billing/members/${strangerMember.memberId}` },
          trainer.accessToken,
        ),
      ).toBe(403);
    });

    it("cannot touch a colleague's diary", async () => {
      const theirs = await request(server)
        .post('/api/v1/training-sessions')
        .set(...bearer(admin.accessToken))
        .send({
          memberId: member.memberId,
          trainerId: strangerTrainer.trainerId,
          startsAt: `${isoDaysFromToday(2)}T09:00:00.000Z`,
          endsAt: `${isoDaysFromToday(2)}T10:00:00.000Z`,
        })
        .expect(201);

      // The member is theirs to manage, but the session is somebody else's.
      expect(
        await call(
          { method: 'post', path: `/api/v1/training-sessions/${theirs.body.id}/cancel` },
          trainer.accessToken,
        ),
      ).toBe(404);
      expect(
        await call(
          {
            method: 'get',
            path: `/api/v1/training-sessions/schedule/trainers/${strangerTrainer.trainerId}`,
          },
          trainer.accessToken,
        ),
      ).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // MEMBER
  // -------------------------------------------------------------------------

  describe('MEMBER', () => {
    const allowed = (): Route[] => [
      { method: 'get', path: '/api/v1/auth/me' },
      { method: 'get', path: '/api/v1/members/me' },
      { method: 'get', path: '/api/v1/memberships/me' },
      { method: 'get', path: '/api/v1/payments/me' },
      { method: 'get', path: '/api/v1/billing/me' },
      { method: 'get', path: '/api/v1/attendance/me' },
      { method: 'get', path: '/api/v1/measurements/me' },
      { method: 'get', path: '/api/v1/measurements/progress/me' },
      { method: 'get', path: '/api/v1/workout-plans/me' },
      { method: 'get', path: '/api/v1/training-sessions/me' },
      { method: 'get', path: '/api/v1/membership-cards/me' },
      { method: 'get', path: '/api/v1/membership-plans' },
      { method: 'get', path: '/api/v1/dashboard/member' },
      { method: 'get', path: '/api/v1/notifications' },
      { method: 'get', path: '/api/v1/notifications/unread-count' },
    ];

    const forbidden = (): Route[] => [
      { method: 'get', path: '/api/v1/users' },
      { method: 'get', path: '/api/v1/members' },
      { method: 'get', path: '/api/v1/trainers' },
      { method: 'get', path: '/api/v1/trainers/me' },
      { method: 'get', path: '/api/v1/memberships' },
      { method: 'get', path: '/api/v1/payments' },
      { method: 'get', path: '/api/v1/billing/outstanding' },
      { method: 'get', path: '/api/v1/accounting/entries' },
      { method: 'get', path: '/api/v1/attendance' },
      { method: 'get', path: '/api/v1/attendance/today' },
      { method: 'get', path: '/api/v1/workout-plans' },
      { method: 'get', path: '/api/v1/measurements' },
      { method: 'get', path: '/api/v1/training-sessions' },
      { method: 'get', path: '/api/v1/dashboard/admin' },
      { method: 'get', path: '/api/v1/dashboard/trainer' },
      { method: 'get', path: `/api/v1/reports/revenue?${PERIOD}` },
      { method: 'get', path: '/api/v1/audit/logs' },
      {
        method: 'post',
        path: '/api/v1/members',
        body: { email: 'x@gym.test', password: 'MemberPass1', firstName: 'A', lastName: 'B' },
      },
      { method: 'post', path: '/api/v1/memberships', body: {} },
      { method: 'post', path: '/api/v1/payments', body: {} },
      { method: 'post', path: '/api/v1/attendance/check-in', body: {} },
      { method: 'post', path: '/api/v1/attendance/check-in/qr', body: { token: 'GYM1.a.1.b' } },
      { method: 'post', path: '/api/v1/workout-plans', body: {} },
      { method: 'post', path: '/api/v1/measurements', body: {} },
      { method: 'post', path: '/api/v1/training-sessions', body: {} },
      { method: 'post', path: '/api/v1/accounting/entries', body: {} },
      { method: 'post', path: '/api/v1/notifications/announcements', body: {} },
      { method: 'post', path: '/api/v1/notifications/run-reminders', body: {} },
    ];

    it.each(
      allowed().map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const),
    )('may reach %s', async (_label, route) => {
      expect(ALLOWED(await call(route, member.accessToken))).toBe(true);
    });

    it.each(
      forbidden().map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const),
    )('is refused %s', async (_label, route) => {
      expect(REFUSED(await call(route, member.accessToken))).toBe(true);
    });

    it('may update their own contact details but nothing that carries meaning', async () => {
      expect(
        ALLOWED(
          await call(
            { method: 'patch', path: '/api/v1/members/me', body: { phone: '+15559999' } },
            member.accessToken,
          ),
        ),
      ).toBe(true);

      // Name, staff notes, status and trainer assignment are not theirs to set.
      for (const body of [
        { notes: 'x' },
        { firstName: 'New' },
        { status: 'ARCHIVED' },
        { assignedTrainerId: ABSENT },
      ]) {
        expect(
          await call({ method: 'patch', path: '/api/v1/members/me', body }, member.accessToken),
        ).toBe(400);
      }
    });

    it("may replace their own card but not block anyone's", async () => {
      expect(
        ALLOWED(
          await call(
            { method: 'post', path: '/api/v1/membership-cards/me/regenerate' },
            member.accessToken,
          ),
        ),
      ).toBe(true);
      expect(
        await call(
          {
            method: 'post',
            path: `/api/v1/membership-cards/members/${member.memberId}/revoke`,
            body: {},
          },
          member.accessToken,
        ),
      ).toBe(403);
    });

    it('cannot check themselves in', async () => {
      expect(
        await call(
          {
            method: 'post',
            path: '/api/v1/attendance/check-in',
            body: { memberId: member.memberId },
          },
          member.accessToken,
        ),
      ).toBe(403);
    });

    it('cannot reach another member by id, and the refusal says nothing', async () => {
      const theirPlan = await request(server)
        .post('/api/v1/workout-plans')
        .set(...bearer(admin.accessToken))
        .send({ memberId: strangerMember.memberId, name: 'Not yours' })
        .expect(201);

      const real = await request(server)
        .get(`/api/v1/workout-plans/${theirPlan.body.id}`)
        .set(...bearer(member.accessToken));
      const invented = await request(server)
        .get(`/api/v1/workout-plans/${ABSENT}`)
        .set(...bearer(member.accessToken));

      expect(real.status).toBe(invented.status);
      expect(real.body.error).toBe(invented.body.error);
      expect(JSON.stringify(real.body)).not.toContain('nora@gym.test');
    });
  });

  // -------------------------------------------------------------------------
  // ANONYMOUS
  // -------------------------------------------------------------------------

  describe('ANONYMOUS', () => {
    const publicRoutes = [
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/forgot-password',
      '/api/v1/auth/reset-password',
    ];

    it.each(publicRoutes)('%s is reachable without a token', async (path) => {
      // An empty body is the unambiguous probe: a route blocked by the guard
      // answers 401 before validation runs, so reaching the validation pipe
      // proves the guard let it through. Asserting "not 401" would not do —
      // a wrong password is legitimately 401 from the handler.
      const res = await request(server).post(path).send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('a genuine but wrong credential is refused by the handler, not the guard', async () => {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@gym.test', password: 'WrongPass123' })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password');
      // Distinct from what the guard says when a token is missing.
      const guarded = await request(server).get('/api/v1/auth/me').expect(401);
      expect(guarded.body.message).toBe('Authentication required');
    });

    it('health is reachable without a token', async () => {
      expect(ALLOWED(await call({ method: 'get', path: '/api/health' }))).toBe(true);
      expect(ALLOWED(await call({ method: 'get', path: '/api/health/live' }))).toBe(true);
    });

    it.each([
      { method: 'get' as const, path: '/api/v1/auth/me' },
      { method: 'get' as const, path: '/api/v1/members' },
      { method: 'get' as const, path: '/api/v1/payments' },
      { method: 'get' as const, path: '/api/v1/dashboard/admin' },
      { method: 'get' as const, path: '/api/v1/notifications' },
      { method: 'get' as const, path: '/api/v1/audit/logs' },
      { method: 'post' as const, path: '/api/v1/members' },
      { method: 'post' as const, path: '/api/v1/payments' },
      { method: 'post' as const, path: '/api/v1/attendance/check-in' },
    ])('$method $path requires a token', async (route) => {
      expect(await call(route)).toBe(401);
    });

    it('cannot get in with a tampered or foreign token', async () => {
      for (const token of ['nonsense', `${member.accessToken.slice(0, -4)}AAAA`]) {
        expect(await call({ method: 'get', path: '/api/v1/auth/me' }, token)).toBe(401);
      }
    });
  });

  // -------------------------------------------------------------------------
  // The declared matrix matches the enforced one
  // -------------------------------------------------------------------------

  describe('the permission audit matches reality', () => {
    it('reports every route, with nothing left unreviewed', async () => {
      const res = await request(server)
        .get('/api/v1/audit/permissions')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.unrestricted).toBe(0);
      expect(res.body.needsReview).toEqual([]);
      expect(res.body.publicRoutes + res.body.serviceScoped + res.body.roleRestricted).toBe(
        res.body.totalRoutes,
      );
    });

    it('every route it calls public really is, and nothing else is', async () => {
      const res = await request(server)
        .get('/api/v1/audit/permissions')
        .set(...bearer(admin.accessToken))
        .expect(200);

      const declaredPublic = (
        res.body.routes as Array<{ public: boolean; method: string; path: string }>
      )
        .filter((route) => route.public)
        .map((route) => `${route.method} ${route.path}`)
        .sort();

      expect(declaredPublic).toEqual([
        'GET /health',
        'GET /health/live',
        'POST /auth/forgot-password',
        'POST /auth/login',
        'POST /auth/refresh',
        'POST /auth/reset-password',
      ]);
    });
  });
});
