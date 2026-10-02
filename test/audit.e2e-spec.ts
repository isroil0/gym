import { AuditOutcome, UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import {
  TEST_PASSWORD,
  bearer,
  seedAndLogin,
  seedMemberProfile,
  seedMembership,
  seedPlan,
  seedTrainerProfile,
  type SignedInUser,
} from './utils/auth';

describe('Audit trail and permission audit (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;

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
  });

  const asAdmin = () => bearer(admin.accessToken);

  const logs = (query: Record<string, unknown> = {}) =>
    request(server)
      .get('/api/v1/audit/logs')
      .query(query)
      .set(...asAdmin());

  describe('what gets recorded', () => {
    it('records a successful mutation with who did it and how long it took', async () => {
      const created = await request(server)
        .post('/api/v1/members')
        .set(...asAdmin())
        .send({
          email: 'mia@gym.test',
          password: 'MemberPass1',
          firstName: 'Mia',
          lastName: 'Member',
        })
        .expect(201);

      const res = await logs({ action: 'members.create' }).expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({
          action: 'members.create',
          method: 'POST',
          statusCode: 201,
          outcome: AuditOutcome.SUCCESS,
          actorId: admin.user.id,
          actorRole: UserRole.ADMIN,
          actorEmail: admin.user.email,
          entityType: 'members',
          entityId: created.body.id,
        }),
      );
      expect(res.body.data[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(res.body.data[0].requestId).toBeTruthy();
    });

    it('records a refused attempt, which is the point of an audit trail', async () => {
      const member = await seedMemberProfile(ctx, server);

      await request(server)
        .post('/api/v1/members')
        .set(...bearer(member.accessToken))
        .send({ email: 'x@gym.test', password: 'MemberPass1', firstName: 'X', lastName: 'Y' })
        .expect(403);

      const res = await logs({ outcome: AuditOutcome.FAILURE }).expect(200);

      const refusal = (
        res.body.data as Array<{ action: string; statusCode: number; errorCode: string }>
      ).find((log) => log.action === 'members.create');
      expect(refusal).toEqual(expect.objectContaining({ statusCode: 403, errorCode: 'FORBIDDEN' }));
    });

    it('records a failed login with no actor, since nobody was authenticated', async () => {
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: admin.user.email, password: 'WrongPassword1' })
        .expect(401);

      const res = await logs({ action: 'auth.login', outcome: AuditOutcome.FAILURE }).expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].actorId).toBeNull();
      expect(res.body.data[0].errorCode).toBe('UNAUTHORIZED');
    });

    it('never stores a password, on login or anywhere else', async () => {
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: admin.user.email, password: TEST_PASSWORD })
        .expect(200);
      await request(server)
        .post('/api/v1/members')
        .set(...asAdmin())
        .send({
          email: 'secret@gym.test',
          password: 'TopSecret123',
          firstName: 'A',
          lastName: 'B',
        })
        .expect(201);

      const res = await logs({ limit: 50 }).expect(200);
      const serialized = JSON.stringify(res.body);

      expect(serialized).not.toContain('TopSecret123');
      expect(serialized).not.toContain(TEST_PASSWORD);
      expect(serialized).toContain('[REDACTED]');
    });

    it('keeps the harmless parts of a payload', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);

      await request(server)
        .post('/api/v1/memberships')
        .set(...asAdmin())
        .send({ memberId: member.memberId, planId: plan.id })
        .expect(201);

      const res = await logs({ action: 'memberships.create' }).expect(200);
      expect(res.body.data[0].payload).toEqual({
        memberId: member.memberId,
        planId: plan.id,
      });
    });

    it('does not record reads', async () => {
      await request(server)
        .get('/api/v1/members')
        .set(...asAdmin())
        .expect(200);

      const res = await logs({ action: 'members.findMany' }).expect(200);
      expect(res.body.meta.total).toBe(0);
    });

    it('records a DELETE', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const member = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });
      const measurement = await request(server)
        .post('/api/v1/measurements')
        .set(...asAdmin())
        .send({ memberId: member.memberId, measuredOn: '2026-10-01', weightKg: 80 })
        .expect(201);

      await request(server)
        .delete(`/api/v1/measurements/${measurement.body.id}`)
        .set(...asAdmin())
        .expect(204);

      const res = await logs({ action: 'measurements.remove' }).expect(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].method).toBe('DELETE');
    });

    it('audits an endpoint nobody annotated, deriving the action name', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);
      const membership = await seedMembership(ctx, member.memberId, plan.id);

      await request(server)
        .post(`/api/v1/memberships/${membership.id}/freeze`)
        .set(...asAdmin())
        .send({})
        .expect(200);

      const res = await logs({ action: 'memberships.freeze' }).expect(200);
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('querying the trail', () => {
    beforeEach(async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server, { email: 'mia@gym.test' });
      const membership = await seedMembership(ctx, member.memberId, plan.id);

      await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({
          memberId: member.memberId,
          membershipId: membership.id,
          amount: 20,
          method: 'CASH',
        })
        .expect(201);
    });

    it('filters by actor, role, action prefix and outcome', async () => {
      const byActor = await logs({ actorId: admin.user.id }).expect(200);
      expect(byActor.body.meta.total).toBeGreaterThan(0);

      const byRole = await logs({ actorRole: UserRole.MEMBER }).expect(200);
      expect(byRole.body.meta.total).toBe(0);

      const byPrefix = await logs({ action: 'payments' }).expect(200);
      expect(byPrefix.body.meta.total).toBe(1);

      const bySuccess = await logs({ outcome: AuditOutcome.SUCCESS }).expect(200);
      expect(bySuccess.body.meta.total).toBeGreaterThan(0);
    });

    it('finds everything that touched one record', async () => {
      const payment = await ctx.prisma.payment.findFirstOrThrow();

      const res = await request(server)
        .get(`/api/v1/audit/logs/entity/payments/${payment.id}`)
        .set(...asAdmin())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].action).toBe('payments.create');
    });

    it('reads one entry by id', async () => {
      const list = await logs({ limit: 1 }).expect(200);

      const res = await request(server)
        .get(`/api/v1/audit/logs/${list.body.data[0].id}`)
        .set(...asAdmin())
        .expect(200);
      expect(res.body.id).toBe(list.body.data[0].id);
    });

    it('returns 404 for an unknown entry', async () => {
      await request(server)
        .get('/api/v1/audit/logs/0b5f8a2e-0000-4000-8000-000000000000')
        .set(...asAdmin())
        .expect(404);
    });

    it('rejects a malformed filter', async () => {
      await logs({ actorId: 'not-a-uuid' }).expect(400);
      await logs({ outcome: 'MAYBE' }).expect(400);
    });

    it('offers no way to change or remove an entry', async () => {
      const list = await logs({ limit: 1 }).expect(200);
      const id = list.body.data[0].id as string;

      // A log an administrator can edit is not evidence.
      for (const attempt of [
        request(server)
          .patch(`/api/v1/audit/logs/${id}`)
          .set(...asAdmin())
          .send({}),
        request(server)
          .delete(`/api/v1/audit/logs/${id}`)
          .set(...asAdmin()),
        request(server)
          .post('/api/v1/audit/logs')
          .set(...asAdmin())
          .send({}),
      ]) {
        const res = await attempt;
        expect(res.status).toBe(404);
      }
    });
  });

  describe('the permission audit', () => {
    it('reports every route and leaves nothing unreviewed', async () => {
      const res = await request(server)
        .get('/api/v1/audit/permissions')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.totalRoutes).toBeGreaterThan(100);
      expect(res.body.routes).toHaveLength(res.body.totalRoutes);

      // Every route is public by design, role-restricted, or declared as
      // service-scoped. An entry here means nobody has reviewed it.
      expect(res.body.needsReview).toEqual([]);
      expect(res.body.unrestricted).toBe(0);
    });

    it('only the intended routes are reachable without a token', async () => {
      const res = await request(server)
        .get('/api/v1/audit/permissions')
        .set(...asAdmin())
        .expect(200);

      const publicPaths = (
        res.body.routes as Array<{ public: boolean; method: string; path: string }>
      )
        .filter((route) => route.public)
        .map((route) => `${route.method} ${route.path}`)
        .sort();

      expect(publicPaths).toEqual([
        'GET /health',
        'GET /health/live',
        'POST /auth/forgot-password',
        'POST /auth/login',
        'POST /auth/refresh',
        'POST /auth/reset-password',
      ]);
    });

    it('accounts for every route in exactly one bucket', async () => {
      const res = await request(server)
        .get('/api/v1/audit/permissions')
        .set(...asAdmin())
        .expect(200);

      expect(
        res.body.publicRoutes +
          res.body.serviceScoped +
          res.body.unrestricted +
          res.body.roleRestricted,
      ).toBe(res.body.totalRoutes);
    });

    it('every service-scoped route explains how it narrows access', async () => {
      const res = await request(server)
        .get('/api/v1/audit/permissions')
        .set(...asAdmin())
        .expect(200);

      const scoped = (
        res.body.routes as Array<{ public: boolean; roles: string[]; scopedAccess: string | null }>
      ).filter((route) => !route.public && route.roles.length === 0);

      expect(scoped.length).toBeGreaterThan(0);
      for (const route of scoped) {
        expect(route.scopedAccess).toBeTruthy();
      }
    });
  });

  describe('authorization', () => {
    it.each(['permissions', 'logs'])('%s is ADMIN only', async (path) => {
      const trainer = await seedTrainerProfile(ctx, server);
      const member = await seedMemberProfile(ctx, server);

      for (const token of [trainer.accessToken, member.accessToken]) {
        await request(server)
          .get(`/api/v1/audit/${path}`)
          .set(...bearer(token))
          .expect(403);
      }
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/audit/logs').expect(401);
      await request(server).get('/api/v1/audit/permissions').expect(401);
    });
  });
});
