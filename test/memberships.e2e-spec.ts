import { MembershipStatus, ProfileStatus, UserRole } from '@prisma/client';
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

describe('Memberships (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;
  let member: Awaited<ReturnType<typeof seedMemberProfile>>;
  let plan: Awaited<ReturnType<typeof seedPlan>>;

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
    member = await seedMemberProfile(ctx, server, { email: 'mia@gym.test' });
    plan = await seedPlan(ctx, { name: 'Monthly Unlimited', durationDays: 30, price: '49.99' });
  });

  const sell = (body: Record<string, unknown>) =>
    request(server)
      .post('/api/v1/memberships')
      .set(...bearer(admin.accessToken))
      .send(body);

  describe('POST /memberships', () => {
    it('sells a membership and snapshots the price and visit allowance', async () => {
      const limited = await seedPlan(ctx, {
        name: 'Ten Pack',
        durationDays: 60,
        visitLimit: 10,
        price: '89.00',
      });

      const res = await sell({ memberId: member.memberId, planId: limited.id }).expect(201);

      expect(res.body.status).toBe(MembershipStatus.ACTIVE);
      expect(res.body.purchasePrice).toBe('89.00');
      expect(res.body.visitLimit).toBe(10);
      expect(res.body.visitsUsed).toBe(0);
      expect(res.body.visitsRemaining).toBe(10);
      expect(res.body.unlimitedVisits).toBe(false);
      expect(res.body.member.email).toBe('mia@gym.test');
    });

    it('computes an inclusive end date from the plan duration', async () => {
      const res = await sell({
        memberId: member.memberId,
        planId: plan.id,
        startDate: isoDaysFromToday(0),
      }).expect(201);

      expect(res.body.startDate.slice(0, 10)).toBe(isoDaysFromToday(0));
      expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(29));
      expect(res.body.totalDays).toBe(30);
      expect(res.body.daysRemaining).toBe(30);
    });

    it('reports unlimited visits as null rather than a number', async () => {
      const res = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      expect(res.body.visitLimit).toBeNull();
      expect(res.body.visitsRemaining).toBeNull();
      expect(res.body.unlimitedVisits).toBe(true);
    });

    it('honours a negotiated purchase price', async () => {
      const res = await sell({
        memberId: member.memberId,
        planId: plan.id,
        purchasePrice: 39.5,
      }).expect(201);

      expect(res.body.purchasePrice).toBe('39.50');
      expect(res.body.plan.currentPrice).toBe('49.99');
    });

    it('marks a future-dated membership PENDING with no days counted yet', async () => {
      const res = await sell({
        memberId: member.memberId,
        planId: plan.id,
        startDate: isoDaysFromToday(10),
      }).expect(201);

      expect(res.body.status).toBe(MembershipStatus.PENDING);
      expect(res.body.daysRemaining).toBe(40);
    });

    it('rejects a membership overlapping an existing one', async () => {
      await sell({
        memberId: member.memberId,
        planId: plan.id,
        startDate: isoDaysFromToday(0),
      }).expect(201);

      const res = await sell({
        memberId: member.memberId,
        planId: plan.id,
        startDate: isoDaysFromToday(15),
      }).expect(422);

      expect(res.body.message).toMatch(/already has a membership covering/);
    });

    it('allows a back-to-back membership starting the day after', async () => {
      await sell({
        memberId: member.memberId,
        planId: plan.id,
        startDate: isoDaysFromToday(0),
      }).expect(201);

      await sell({
        memberId: member.memberId,
        planId: plan.id,
        startDate: isoDaysFromToday(30),
      }).expect(201);
    });

    it('allows a new membership once the previous one is cancelled', async () => {
      const first = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      await request(server)
        .post(`/api/v1/memberships/${first.body.id}/cancel`)
        .set(...bearer(admin.accessToken))
        .send({ reason: 'Changed plan' })
        .expect(200);

      await sell({ memberId: member.memberId, planId: plan.id }).expect(201);
    });

    it('refuses to sell to an archived member', async () => {
      await ctx.prisma.member.update({
        where: { id: member.memberId },
        data: { status: ProfileStatus.ARCHIVED },
      });

      const res = await sell({ memberId: member.memberId, planId: plan.id }).expect(422);
      expect(res.body.message).toMatch(/archived member/);
    });

    it('rejects an unknown member and an unknown plan', async () => {
      await sell({
        memberId: '0b5f8a2e-0000-4000-8000-000000000000',
        planId: plan.id,
      }).expect(404);

      await sell({
        memberId: member.memberId,
        planId: '0b5f8a2e-0000-4000-8000-000000000000',
      }).expect(404);
    });

    it('rejects unknown properties', async () => {
      await sell({ memberId: member.memberId, planId: plan.id, visitsUsed: 5 }).expect(400);
    });
  });

  describe('freeze and unfreeze', () => {
    it('stops the clock without moving the end date yet', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);
      const endBefore = sold.body.endDate;

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/freeze`)
        .set(...bearer(admin.accessToken))
        .send({ reason: 'Travelling' })
        .expect(200);

      expect(res.body.status).toBe(MembershipStatus.FROZEN);
      expect(res.body.frozenAt).not.toBeNull();
      expect(res.body.endDate).toBe(endBefore);
      expect(res.body.daysRemaining).toBeNull();
      expect(res.body.freezes).toHaveLength(1);
      expect(res.body.freezes[0].reason).toBe('Travelling');
      expect(res.body.freezes[0].endedAt).toBeNull();
    });

    it('credits the frozen days back on unfreeze', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);
      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/freeze`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(200);

      // Backdate the pause by five days.
      const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
      await ctx.prisma.memberMembership.update({
        where: { id: sold.body.id },
        data: { frozenAt: fiveDaysAgo },
      });
      await ctx.prisma.membershipFreeze.updateMany({
        where: { membershipId: sold.body.id },
        data: { startedAt: fiveDaysAgo },
      });

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/unfreeze`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.status).toBe(MembershipStatus.ACTIVE);
      expect(res.body.totalFrozenDays).toBe(5);
      expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(34));
      expect(res.body.frozenAt).toBeNull();
      expect(res.body.freezes[0].days).toBe(5);
      expect(res.body.freezes[0].endedAt).not.toBeNull();
    });

    it('credits nothing for a same-day freeze and unfreeze', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);
      const endBefore = sold.body.endDate;

      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/freeze`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(200);

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/unfreeze`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.totalFrozenDays).toBe(0);
      expect(res.body.endDate).toBe(endBefore);
    });

    it('keeps a frozen membership from expiring', async () => {
      const membership = await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(-40)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-10)}T00:00:00.000Z`),
        status: MembershipStatus.FROZEN,
        frozenAt: new Date(Date.now() - 20 * 86_400_000),
      });

      await request(server)
        .post('/api/v1/memberships/sync-statuses')
        .set(...bearer(admin.accessToken))
        .expect(200);

      const res = await request(server)
        .get(`/api/v1/memberships/${membership.id}`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.status).toBe(MembershipStatus.FROZEN);
    });

    it('accumulates across repeated freezes', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      for (const days of [3, 2]) {
        await request(server)
          .post(`/api/v1/memberships/${sold.body.id}/freeze`)
          .set(...bearer(admin.accessToken))
          .send({})
          .expect(200);

        const backdated = new Date(Date.now() - days * 86_400_000);
        await ctx.prisma.memberMembership.update({
          where: { id: sold.body.id },
          data: { frozenAt: backdated },
        });
        await ctx.prisma.membershipFreeze.updateMany({
          where: { membershipId: sold.body.id, endedAt: null },
          data: { startedAt: backdated },
        });

        await request(server)
          .post(`/api/v1/memberships/${sold.body.id}/unfreeze`)
          .set(...bearer(admin.accessToken))
          .expect(200);
      }

      const res = await request(server)
        .get(`/api/v1/memberships/${sold.body.id}`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.totalFrozenDays).toBe(5);
      expect(res.body.freezes).toHaveLength(2);
      expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(34));
    });

    it('refuses to freeze twice or unfreeze what is not frozen', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/unfreeze`)
        .set(...bearer(admin.accessToken))
        .expect(409);

      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/freeze`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(200);
      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/freeze`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(409);
    });
  });

  describe('extend', () => {
    it('adds days and records them separately from freeze credit', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/extend`)
        .set(...bearer(admin.accessToken))
        .send({ days: 7, reason: 'Goodwill for the closed week' })
        .expect(200);

      expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(36));
      expect(res.body.extendedDays).toBe(7);
      expect(res.body.totalFrozenDays).toBe(0);
      expect(res.body.totalDays).toBe(37);
    });

    it('revives an expired membership', async () => {
      const membership = await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(-40)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-5)}T00:00:00.000Z`),
        status: MembershipStatus.EXPIRED,
      });

      const res = await request(server)
        .post(`/api/v1/memberships/${membership.id}/extend`)
        .set(...bearer(admin.accessToken))
        .send({ days: 10 })
        .expect(200);

      expect(res.body.status).toBe(MembershipStatus.ACTIVE);
      expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(5));
    });

    it('rejects a non-positive or oversized extension', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      for (const days of [0, -5, 400]) {
        await request(server)
          .post(`/api/v1/memberships/${sold.body.id}/extend`)
          .set(...bearer(admin.accessToken))
          .send({ days })
          .expect(400);
      }
    });

    it('refuses to extend into an overlapping membership', async () => {
      const first = await sell({
        memberId: member.memberId,
        planId: plan.id,
        startDate: isoDaysFromToday(0),
      }).expect(201);
      await sell({
        memberId: member.memberId,
        planId: plan.id,
        startDate: isoDaysFromToday(30),
      }).expect(201);

      await request(server)
        .post(`/api/v1/memberships/${first.body.id}/extend`)
        .set(...bearer(admin.accessToken))
        .send({ days: 5 })
        .expect(422);
    });
  });

  describe('renew', () => {
    it('starts the day after the current term and chains to it', async () => {
      const sold = await sell({
        memberId: member.memberId,
        planId: plan.id,
        startDate: isoDaysFromToday(0),
      }).expect(201);

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/renew`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(201);

      expect(res.body.id).not.toBe(sold.body.id);
      expect(res.body.previousMembershipId).toBe(sold.body.id);
      expect(res.body.startDate.slice(0, 10)).toBe(isoDaysFromToday(30));
      expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(59));
      expect(res.body.status).toBe(MembershipStatus.PENDING);
    });

    it("prices the renewal at today's plan price, leaving the old term untouched", async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      await request(server)
        .patch(`/api/v1/membership-plans/${plan.id}`)
        .set(...bearer(admin.accessToken))
        .send({ price: 59.99 })
        .expect(200);

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/renew`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(201);

      expect(res.body.purchasePrice).toBe('59.99');

      const original = await request(server)
        .get(`/api/v1/memberships/${sold.body.id}`)
        .set(...bearer(admin.accessToken))
        .expect(200);
      expect(original.body.purchasePrice).toBe('49.99');
    });

    it('can upgrade to a different plan', async () => {
      const annual = await seedPlan(ctx, { name: 'Annual', durationDays: 365, price: '449.00' });
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/renew`)
        .set(...bearer(admin.accessToken))
        .send({ planId: annual.id })
        .expect(201);

      expect(res.body.plan.name).toBe('Annual');
      expect(res.body.purchasePrice).toBe('449.00');
      expect(res.body.totalDays).toBe(365);
    });

    it('starts today when the previous term already lapsed', async () => {
      const lapsed = await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(-60)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-30)}T00:00:00.000Z`),
        status: MembershipStatus.EXPIRED,
      });

      const res = await request(server)
        .post(`/api/v1/memberships/${lapsed.id}/renew`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(201);

      expect(res.body.startDate.slice(0, 10)).toBe(isoDaysFromToday(0));
      expect(res.body.status).toBe(MembershipStatus.ACTIVE);
    });

    it('refuses to renew the same membership twice', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/renew`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(201);
      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/renew`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(409);
    });

    it('refuses to renew a cancelled membership', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);
      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/cancel`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(200);

      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/renew`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(422);
    });

    it('refuses to renew onto an archived plan', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);
      await request(server)
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/renew`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(422);
    });
  });

  describe('cancel and expire', () => {
    it('cancels with a reason and zeroes the remaining days', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/cancel`)
        .set(...bearer(admin.accessToken))
        .send({ reason: 'Member relocated' })
        .expect(200);

      expect(res.body.status).toBe(MembershipStatus.CANCELLED);
      expect(res.body.cancellationReason).toBe('Member relocated');
      expect(res.body.cancelledAt).not.toBeNull();
      expect(res.body.daysRemaining).toBe(0);
    });

    it('closes an open freeze when cancelling', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);
      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/freeze`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(200);

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/cancel`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(200);

      expect(res.body.frozenAt).toBeNull();
      expect(res.body.freezes[0].endedAt).not.toBeNull();
    });

    it('expires a membership early and pulls the end date back', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/expire`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.status).toBe(MembershipStatus.EXPIRED);
      expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(0));
    });

    it('does not let the status sweep revive a force-expired membership', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);
      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/expire`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      await request(server)
        .post('/api/v1/memberships/sync-statuses')
        .set(...bearer(admin.accessToken))
        .expect(200);

      const res = await request(server)
        .get(`/api/v1/memberships/${sold.body.id}`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.status).toBe(MembershipStatus.EXPIRED);
    });

    it.each([
      ['freeze', 'freeze'],
      ['extend', 'extend'],
      ['expire', 'expire'],
    ])('refuses to %s a cancelled membership', async (_label, action) => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);
      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/cancel`)
        .set(...bearer(admin.accessToken))
        .send({})
        .expect(200);

      const res = await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/${action}`)
        .set(...bearer(admin.accessToken))
        .send(action === 'extend' ? { days: 7 } : {});

      expect(res.status).toBe(422);
    });

    it('refuses to cancel or expire twice', async () => {
      const sold = await sell({ memberId: member.memberId, planId: plan.id }).expect(201);

      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/expire`)
        .set(...bearer(admin.accessToken))
        .expect(200);
      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/expire`)
        .set(...bearer(admin.accessToken))
        .expect(409);
    });
  });

  describe('status synchronisation', () => {
    it('expires a membership whose end date has passed', async () => {
      const stale = await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(-40)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-1)}T00:00:00.000Z`),
        status: MembershipStatus.ACTIVE,
      });

      const res = await request(server)
        .post('/api/v1/memberships/sync-statuses')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.expired).toBe(1);

      const reloaded = await ctx.prisma.memberMembership.findUniqueOrThrow({
        where: { id: stale.id },
      });
      expect(reloaded.status).toBe(MembershipStatus.EXPIRED);
    });

    it('activates a pending membership that has reached its start date', async () => {
      const pending = await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(0)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(29)}T00:00:00.000Z`),
        status: MembershipStatus.PENDING,
      });

      const res = await request(server)
        .post('/api/v1/memberships/sync-statuses')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.activated).toBe(1);

      const reloaded = await ctx.prisma.memberMembership.findUniqueOrThrow({
        where: { id: pending.id },
      });
      expect(reloaded.status).toBe(MembershipStatus.ACTIVE);
    });

    it('corrects a stale status on a single read, without a sweep', async () => {
      const stale = await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(-40)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-1)}T00:00:00.000Z`),
        status: MembershipStatus.ACTIVE,
      });

      const res = await request(server)
        .get(`/api/v1/memberships/${stale.id}`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.status).toBe(MembershipStatus.EXPIRED);
    });

    it('is idempotent', async () => {
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(-40)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-1)}T00:00:00.000Z`),
        status: MembershipStatus.ACTIVE,
      });

      await request(server)
        .post('/api/v1/memberships/sync-statuses')
        .set(...bearer(admin.accessToken))
        .expect(200);

      const second = await request(server)
        .post('/api/v1/memberships/sync-statuses')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(second.body).toEqual({ expired: 0, activated: 0 });
    });
  });

  describe('listing and history', () => {
    it('filters by status, member and expiry window', async () => {
      const other = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });

      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(0)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(5)}T00:00:00.000Z`),
      });
      await seedMembership(ctx, other.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(0)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(100)}T00:00:00.000Z`),
      });

      const byMember = await request(server)
        .get('/api/v1/memberships')
        .query({ memberId: member.memberId })
        .set(...bearer(admin.accessToken))
        .expect(200);
      expect(byMember.body.meta.total).toBe(1);

      const expiringSoon = await request(server)
        .get('/api/v1/memberships')
        .query({ endingBefore: isoDaysFromToday(7) })
        .set(...bearer(admin.accessToken))
        .expect(200);
      expect(expiringSoon.body.meta.total).toBe(1);

      const active = await request(server)
        .get('/api/v1/memberships')
        .query({ status: MembershipStatus.ACTIVE })
        .set(...bearer(admin.accessToken))
        .expect(200);
      expect(active.body.meta.total).toBe(2);
    });

    it('gives a member their current membership and full history', async () => {
      const lapsed = await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(-60)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-31)}T00:00:00.000Z`),
        status: MembershipStatus.EXPIRED,
      });
      const current = await seedMembership(ctx, member.memberId, plan.id);

      const res = await request(server)
        .get('/api/v1/memberships/me')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.current.id).toBe(current.id);
      expect(res.body.history).toHaveLength(2);
      expect(res.body.history.map((m: { id: string }) => m.id)).toEqual(
        expect.arrayContaining([lapsed.id, current.id]),
      );
    });

    it('reports null current membership when nothing is live', async () => {
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: new Date(`${isoDaysFromToday(-60)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-31)}T00:00:00.000Z`),
        status: MembershipStatus.EXPIRED,
      });

      const res = await request(server)
        .get('/api/v1/memberships/me')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.current).toBeNull();
      expect(res.body.history).toHaveLength(1);
    });

    it('treats a frozen membership as the current one', async () => {
      const frozen = await seedMembership(ctx, member.memberId, plan.id, {
        status: MembershipStatus.FROZEN,
        frozenAt: new Date(),
      });

      const res = await request(server)
        .get('/api/v1/memberships/me')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.current.id).toBe(frozen.id);
      expect(res.body.current.status).toBe(MembershipStatus.FROZEN);
    });

    it('hides staff notes from the member', async () => {
      const sold = await sell({
        memberId: member.memberId,
        planId: plan.id,
        notes: 'Negotiated down, watch for churn',
      }).expect(201);
      expect(sold.body.notes).toBe('Negotiated down, watch for churn');

      const own = await request(server)
        .get('/api/v1/memberships/me')
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(own.body.current).not.toHaveProperty('notes');
      expect(JSON.stringify(own.body)).not.toContain('watch for churn');

      const byId = await request(server)
        .get(`/api/v1/memberships/${sold.body.id}`)
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(byId.body).not.toHaveProperty('notes');
    });
  });

  describe('authorization and scoping', () => {
    it('a member sees only their own membership by id', async () => {
      const mine = await seedMembership(ctx, member.memberId, plan.id);
      const other = await seedMemberProfile(ctx, server, { email: 'nosy@gym.test' });
      const theirs = await seedMembership(ctx, other.memberId, plan.id);

      await request(server)
        .get(`/api/v1/memberships/${mine.id}`)
        .set(...bearer(member.accessToken))
        .expect(200);

      await request(server)
        .get(`/api/v1/memberships/${theirs.id}`)
        .set(...bearer(member.accessToken))
        .expect(404);
    });

    it('a trainer sees memberships only for their assigned members', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const assigned = await seedMemberProfile(ctx, server, {
        email: 'assigned@gym.test',
        assignedTrainerId: trainer.trainerId,
      });
      const assignedMembership = await seedMembership(ctx, assigned.memberId, plan.id);
      const unassignedMembership = await seedMembership(ctx, member.memberId, plan.id);

      const list = await request(server)
        .get('/api/v1/memberships')
        .set(...bearer(trainer.accessToken))
        .expect(200);
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0].id).toBe(assignedMembership.id);

      await request(server)
        .get(`/api/v1/memberships/${assignedMembership.id}`)
        .set(...bearer(trainer.accessToken))
        .expect(200);

      await request(server)
        .get(`/api/v1/memberships/${unassignedMembership.id}`)
        .set(...bearer(trainer.accessToken))
        .expect(404);
    });

    it('a trainer cannot widen scope with a memberId filter', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      await seedMembership(ctx, member.memberId, plan.id);

      const res = await request(server)
        .get('/api/v1/memberships')
        .query({ memberId: member.memberId })
        .set(...bearer(trainer.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });

    it('a member cannot list all memberships', async () => {
      await request(server)
        .get('/api/v1/memberships')
        .set(...bearer(member.accessToken))
        .expect(403);
    });

    it.each([
      ['', {}],
      ['/renew', {}],
      ['/extend', { days: 7 }],
      ['/freeze', {}],
      ['/unfreeze', {}],
      ['/cancel', {}],
      ['/expire', {}],
    ])('POST /memberships/:id%s is ADMIN only', async (suffix, body) => {
      const trainer = await seedTrainerProfile(ctx, server);
      const membership = await seedMembership(ctx, member.memberId, plan.id);
      const path = suffix ? `/api/v1/memberships/${membership.id}${suffix}` : '/api/v1/memberships';

      for (const token of [trainer.accessToken, member.accessToken]) {
        const res = await request(server)
          .post(path)
          .set(...bearer(token))
          .send(body);
        expect(res.status).toBe(403);
      }
    });

    it('sync-statuses is ADMIN only', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      await request(server)
        .post('/api/v1/memberships/sync-statuses')
        .set(...bearer(trainer.accessToken))
        .expect(403);
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/memberships').expect(401);
      await request(server).get('/api/v1/memberships/me').expect(401);
    });
  });
});
