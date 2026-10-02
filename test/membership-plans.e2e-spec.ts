import { MembershipPlanStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import {
  bearer,
  seedAndLogin,
  seedMemberProfile,
  seedMembership,
  seedPlan,
  seedTrainerProfile,
  type SignedInUser,
} from './utils/auth';

describe('Membership plans (e2e)', () => {
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

  describe('POST /membership-plans', () => {
    it('creates a plan with a configurable duration and price', async () => {
      const res = await request(server)
        .post('/api/v1/membership-plans')
        .set(...bearer(admin.accessToken))
        .send({
          name: 'Monthly Unlimited',
          description: 'Unlimited visits for 30 days.',
          durationDays: 30,
          price: 49.99,
          displayOrder: 10,
        })
        .expect(201);

      expect(res.body.durationDays).toBe(30);
      expect(res.body.price).toBe('49.99');
      expect(res.body.visitLimit).toBeNull();
      expect(res.body.unlimitedVisits).toBe(true);
      expect(res.body.status).toBe(MembershipPlanStatus.ACTIVE);
    });

    it('creates a limited-visit plan', async () => {
      const res = await request(server)
        .post('/api/v1/membership-plans')
        .set(...bearer(admin.accessToken))
        .send({ name: 'Ten Pack', durationDays: 60, price: 89, visitLimit: 10 })
        .expect(201);

      expect(res.body.visitLimit).toBe(10);
      expect(res.body.unlimitedVisits).toBe(false);
      expect(res.body.price).toBe('89.00');
    });

    it('returns the price as an exact decimal string', async () => {
      const res = await request(server)
        .post('/api/v1/membership-plans')
        .set(...bearer(admin.accessToken))
        .send({ name: 'Odd Price', durationDays: 30, price: 0.1 })
        .expect(201);

      expect(res.body.price).toBe('0.10');
    });

    it('rejects a duplicate name', async () => {
      await seedPlan(ctx, { name: 'Monthly Unlimited' });

      const res = await request(server)
        .post('/api/v1/membership-plans')
        .set(...bearer(admin.accessToken))
        .send({ name: 'Monthly Unlimited', durationDays: 30, price: 49.99 })
        .expect(409);

      expect(res.body.details).toEqual([{ field: 'name', messages: ['must be unique'] }]);
    });

    it.each([
      ['a zero duration', { name: 'A', durationDays: 0, price: 10 }],
      ['a negative price', { name: 'B', durationDays: 30, price: -1 }],
      ['three decimal places', { name: 'C', durationDays: 30, price: 10.123 }],
      ['a zero visit limit', { name: 'D', durationDays: 30, price: 10, visitLimit: 0 }],
      ['a duration beyond ten years', { name: 'E', durationDays: 4000, price: 10 }],
    ])('rejects %s', async (_label, body) => {
      await request(server)
        .post('/api/v1/membership-plans')
        .set(...bearer(admin.accessToken))
        .send(body)
        .expect(400);
    });

    it('accepts a free plan', async () => {
      const res = await request(server)
        .post('/api/v1/membership-plans')
        .set(...bearer(admin.accessToken))
        .send({ name: 'Trial', durationDays: 7, price: 0 })
        .expect(201);

      expect(res.body.price).toBe('0.00');
    });
  });

  describe('visibility', () => {
    beforeEach(async () => {
      await seedPlan(ctx, { name: 'On Sale', displayOrder: 1 });
      await seedPlan(ctx, {
        name: 'Retired',
        status: MembershipPlanStatus.ARCHIVED,
        displayOrder: 2,
      });
    });

    it('shows an administrator archived plans too', async () => {
      const res = await request(server)
        .get('/api/v1/membership-plans')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(2);
    });

    it.each([UserRole.TRAINER, UserRole.MEMBER])('shows %s only plans on sale', async (role) => {
      const user = await seedAndLogin(ctx, server, { role });

      const res = await request(server)
        .get('/api/v1/membership-plans')
        .set(...bearer(user.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].name).toBe('On Sale');
    });

    it('gives a member an empty list for an explicit ARCHIVED filter', async () => {
      const member = await seedAndLogin(ctx, server, { role: UserRole.MEMBER });

      const res = await request(server)
        .get('/api/v1/membership-plans')
        .query({ status: MembershipPlanStatus.ARCHIVED })
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });

    it('hides an archived plan from a member reading it by id', async () => {
      const member = await seedAndLogin(ctx, server, { role: UserRole.MEMBER });
      const retired = await ctx.prisma.membershipPlan.findFirstOrThrow({
        where: { name: 'Retired' },
      });

      await request(server)
        .get(`/api/v1/membership-plans/${retired.id}`)
        .set(...bearer(member.accessToken))
        .expect(404);

      await request(server)
        .get(`/api/v1/membership-plans/${retired.id}`)
        .set(...bearer(admin.accessToken))
        .expect(200);
    });

    it('orders plans by display order', async () => {
      await seedPlan(ctx, { name: 'First', displayOrder: 0 });

      const res = await request(server)
        .get('/api/v1/membership-plans')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.data[0].name).toBe('First');
    });

    it('searches by name', async () => {
      const res = await request(server)
        .get('/api/v1/membership-plans')
        .query({ search: 'sal' })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].name).toBe('On Sale');
    });
  });

  describe('PATCH /membership-plans/:id', () => {
    it('changing the price does not rewrite memberships already sold', async () => {
      const plan = await seedPlan(ctx, { name: 'Monthly', price: '49.99' });
      const member = await seedMemberProfile(ctx, server);
      const membership = await seedMembership(ctx, member.memberId, plan.id, {
        purchasePrice: '49.99',
      });

      await request(server)
        .patch(`/api/v1/membership-plans/${plan.id}`)
        .set(...bearer(admin.accessToken))
        .send({ price: 59.99 })
        .expect(200);

      const res = await request(server)
        .get(`/api/v1/memberships/${membership.id}`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.purchasePrice).toBe('49.99');
      expect(res.body.plan.currentPrice).toBe('59.99');
    });

    it("changing the duration does not move an existing membership's end date", async () => {
      const plan = await seedPlan(ctx, { durationDays: 30 });
      const member = await seedMemberProfile(ctx, server);
      const membership = await seedMembership(ctx, member.memberId, plan.id);
      const before = membership.endDate.toISOString();

      await request(server)
        .patch(`/api/v1/membership-plans/${plan.id}`)
        .set(...bearer(admin.accessToken))
        .send({ durationDays: 90 })
        .expect(200);

      const reloaded = await ctx.prisma.memberMembership.findUniqueOrThrow({
        where: { id: membership.id },
      });
      expect(reloaded.endDate.toISOString()).toBe(before);
    });

    it('can make a limited plan unlimited', async () => {
      const plan = await seedPlan(ctx, { visitLimit: 12 });

      const res = await request(server)
        .patch(`/api/v1/membership-plans/${plan.id}`)
        .set(...bearer(admin.accessToken))
        .send({ visitLimit: null })
        .expect(200);

      expect(res.body.visitLimit).toBeNull();
      expect(res.body.unlimitedVisits).toBe(true);
    });

    it('allows resubmitting the same name', async () => {
      const plan = await seedPlan(ctx, { name: 'Same Name' });

      await request(server)
        .patch(`/api/v1/membership-plans/${plan.id}`)
        .set(...bearer(admin.accessToken))
        .send({ name: 'Same Name', price: 55 })
        .expect(200);
    });

    it('rejects renaming onto another plan', async () => {
      const plan = await seedPlan(ctx, { name: 'Plan A' });
      await seedPlan(ctx, { name: 'Plan B' });

      await request(server)
        .patch(`/api/v1/membership-plans/${plan.id}`)
        .set(...bearer(admin.accessToken))
        .send({ name: 'Plan B' })
        .expect(409);
    });
  });

  describe('archive / reactivate', () => {
    it('stops a plan being sold while leaving existing memberships alone', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);
      const existing = await seedMembership(ctx, member.memberId, plan.id);

      await request(server)
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      const other = await seedMemberProfile(ctx, server);
      const sale = await request(server)
        .post('/api/v1/memberships')
        .set(...bearer(admin.accessToken))
        .send({ memberId: other.memberId, planId: plan.id })
        .expect(422);
      expect(sale.body.message).toMatch(/archived and cannot be sold/);

      const reloaded = await request(server)
        .get(`/api/v1/memberships/${existing.id}`)
        .set(...bearer(admin.accessToken))
        .expect(200);
      expect(reloaded.body.status).toBe('ACTIVE');
    });

    it('refuses to archive twice and to reactivate an active plan', async () => {
      const plan = await seedPlan(ctx);

      await request(server)
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);
      await request(server)
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(409);

      await request(server)
        .post(`/api/v1/membership-plans/${plan.id}/reactivate`)
        .set(...bearer(admin.accessToken))
        .expect(200);
      await request(server)
        .post(`/api/v1/membership-plans/${plan.id}/reactivate`)
        .set(...bearer(admin.accessToken))
        .expect(409);
    });

    it('makes a reactivated plan sellable again', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);

      await request(server)
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);
      await request(server)
        .post(`/api/v1/membership-plans/${plan.id}/reactivate`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      await request(server)
        .post('/api/v1/memberships')
        .set(...bearer(admin.accessToken))
        .send({ memberId: member.memberId, planId: plan.id })
        .expect(201);
    });
  });

  describe('authorization', () => {
    it.each([
      ['post', '/api/v1/membership-plans'],
      ['patch', '/api/v1/membership-plans/0b5f8a2e-0000-4000-8000-000000000000'],
      ['post', '/api/v1/membership-plans/0b5f8a2e-0000-4000-8000-000000000000/archive'],
    ])('%s %s is ADMIN only', async (method, path) => {
      const trainer = await seedTrainerProfile(ctx, server);
      const member = await seedMemberProfile(ctx, server);

      for (const token of [trainer.accessToken, member.accessToken]) {
        const res = await request(server)
          [method as 'post' | 'patch'](path)
          .set(...bearer(token))
          .send({});
        expect(res.status).toBe(403);
      }
    });

    it('requires authentication to list plans', async () => {
      await request(server).get('/api/v1/membership-plans').expect(401);
    });
  });
});
