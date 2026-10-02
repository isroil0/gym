import { AccountingEntryType, PaymentMethod, PaymentStatus, UserRole } from '@prisma/client';
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

describe('Payments (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;
  let member: Awaited<ReturnType<typeof seedMemberProfile>>;
  let plan: Awaited<ReturnType<typeof seedPlan>>;
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
    member = await seedMemberProfile(ctx, server, { email: 'mia@gym.test' });
    plan = await seedPlan(ctx, { name: 'Monthly', durationDays: 30, price: '49.99' });
    const membership = await seedMembership(ctx, member.memberId, plan.id, {
      purchasePrice: '49.99',
    });
    membershipId = membership.id;
  });

  const pay = (body: Record<string, unknown>) =>
    request(server)
      .post('/api/v1/payments')
      .set(...bearer(admin.accessToken))
      .send(body);

  describe('POST /payments', () => {
    it('records the payment and posts the matching income entry', async () => {
      const res = await pay({
        memberId: member.memberId,
        membershipId,
        amount: 49.99,
        method: PaymentMethod.CASH,
        reference: 'RCPT-1',
      }).expect(201);

      expect(res.body.amount).toBe('49.99');
      expect(res.body.netAmount).toBe('49.99');
      expect(res.body.refundableAmount).toBe('49.99');
      expect(res.body.status).toBe(PaymentStatus.COMPLETED);
      expect(res.body.memberCode).toMatch(/^M-\d{6}$/);
      expect(res.body.recordedBy).toBeTruthy();

      const entries = await ctx.prisma.accountingEntry.findMany();
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe(AccountingEntryType.INCOME);
      expect(entries[0].amount.toFixed(2)).toBe('49.99');
      expect(entries[0].paymentId).toBe(res.body.id);
      expect(entries[0].isAutomatic).toBe(true);
    });

    it('posts the income on the date the money changed hands, not today', async () => {
      const res = await pay({
        memberId: member.memberId,
        membershipId,
        amount: 10,
        method: PaymentMethod.CARD,
        paidAt: isoDaysFromToday(-5),
      }).expect(201);

      const entry = await ctx.prisma.accountingEntry.findFirstOrThrow({
        where: { paymentId: res.body.id },
      });
      expect(entry.occurredOn.toISOString().slice(0, 10)).toBe(isoDaysFromToday(-5));
    });

    it('cannot post the income twice for one payment', async () => {
      const res = await pay({
        memberId: member.memberId,
        membershipId,
        amount: 49.99,
        method: PaymentMethod.CASH,
      }).expect(201);

      // The unique index is what makes the invariant real, not call-site care.
      await expect(
        ctx.prisma.accountingEntry.create({
          data: {
            type: AccountingEntryType.INCOME,
            amount: '49.99',
            occurredOn: new Date(`${isoDaysFromToday(0)}T00:00:00.000Z`),
            description: 'duplicate',
            paymentId: res.body.id,
            isAutomatic: true,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('leaves no payment behind when the ledger write fails', async () => {
      // A membership belonging to someone else is rejected before either write.
      const other = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });
      const theirs = await seedMembership(ctx, other.memberId, plan.id);

      await pay({
        memberId: member.memberId,
        membershipId: theirs.id,
        amount: 10,
        method: PaymentMethod.CASH,
      }).expect(422);

      expect(await ctx.prisma.payment.count()).toBe(0);
      expect(await ctx.prisma.accountingEntry.count()).toBe(0);
    });

    it('accepts a payment with no membership as other member income', async () => {
      const res = await pay({
        memberId: member.memberId,
        amount: 15,
        method: PaymentMethod.OTHER,
      }).expect(201);

      expect(res.body.membershipId).toBeNull();
      expect(await ctx.prisma.accountingEntry.count()).toBe(1);
    });

    it.each([PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.TRANSFER, PaymentMethod.OTHER])(
      'accepts the %s method and carries it onto the ledger entry',
      async (method) => {
        const res = await pay({
          memberId: member.memberId,
          membershipId,
          amount: 10,
          method,
        }).expect(201);

        const entry = await ctx.prisma.accountingEntry.findFirstOrThrow({
          where: { paymentId: res.body.id },
        });
        expect(entry.method).toBe(method);
      },
    );

    it.each([
      ['a zero amount', { amount: 0 }],
      ['a negative amount', { amount: -10 }],
      ['three decimal places', { amount: 10.123 }],
      ['an unknown method', { method: 'BITCOIN' }],
    ])('rejects %s', async (_label, override) => {
      await pay({
        memberId: member.memberId,
        membershipId,
        amount: 10,
        method: PaymentMethod.CASH,
        ...override,
      }).expect(400);

      expect(await ctx.prisma.payment.count()).toBe(0);
    });

    it('rejects an unknown member', async () => {
      await pay({
        memberId: '0b5f8a2e-0000-4000-8000-000000000000',
        amount: 10,
        method: PaymentMethod.CASH,
      }).expect(404);
    });

    it('rejects unknown properties', async () => {
      await pay({
        memberId: member.memberId,
        amount: 10,
        method: PaymentMethod.CASH,
        status: PaymentStatus.REFUNDED,
      }).expect(400);
    });
  });

  describe('POST /payments/:id/refund', () => {
    let paymentId: string;

    beforeEach(async () => {
      const res = await pay({
        memberId: member.memberId,
        membershipId,
        amount: 50,
        method: PaymentMethod.CASH,
      }).expect(201);
      paymentId = res.body.id;
    });

    const refund = (body: Record<string, unknown>) =>
      request(server)
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set(...bearer(admin.accessToken))
        .send(body);

    it('records a partial refund and posts a REFUND entry', async () => {
      const res = await refund({ amount: 20, reason: 'Goodwill' }).expect(200);

      expect(res.body.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(res.body.refundedAmount).toBe('20.00');
      expect(res.body.netAmount).toBe('30.00');
      expect(res.body.refundableAmount).toBe('30.00');
      expect(res.body.refunds).toHaveLength(1);

      const entries = await ctx.prisma.accountingEntry.findMany({
        where: { type: AccountingEntryType.REFUND },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].amount.toFixed(2)).toBe('20.00');
      expect(entries[0].isAutomatic).toBe(true);
    });

    it('marks a full refund as REFUNDED', async () => {
      const res = await refund({ amount: 50, reason: 'Cancelled' }).expect(200);

      expect(res.body.status).toBe(PaymentStatus.REFUNDED);
      expect(res.body.refundableAmount).toBe('0.00');
    });

    it('accumulates partial refunds up to the full amount', async () => {
      await refund({ amount: 20, reason: 'First' }).expect(200);
      const res = await refund({ amount: 30, reason: 'Second' }).expect(200);

      expect(res.body.status).toBe(PaymentStatus.REFUNDED);
      expect(res.body.refundedAmount).toBe('50.00');
      expect(res.body.refunds).toHaveLength(2);
    });

    it('refuses to refund more than remains', async () => {
      await refund({ amount: 40, reason: 'First' }).expect(200);

      const res = await refund({ amount: 20, reason: 'Too much' }).expect(422);
      expect(res.body.message).toMatch(/exceeds the 10.00 still refundable/);

      expect(
        await ctx.prisma.accountingEntry.count({ where: { type: AccountingEntryType.REFUND } }),
      ).toBe(1);
    });

    it('refuses to refund a fully refunded payment again', async () => {
      await refund({ amount: 50, reason: 'All of it' }).expect(200);

      const res = await refund({ amount: 1, reason: 'More' }).expect(422);
      expect(res.body.message).toMatch(/already been refunded in full/);
    });

    it('requires a reason', async () => {
      await refund({ amount: 10 }).expect(400);
    });

    it('can return the money by a different method', async () => {
      const res = await refund({
        amount: 10,
        reason: 'Card reversal',
        method: PaymentMethod.TRANSFER,
      }).expect(200);

      expect(res.body.refunds[0].method).toBe(PaymentMethod.TRANSFER);
    });
  });

  describe('listing and history', () => {
    beforeEach(async () => {
      await pay({
        memberId: member.memberId,
        membershipId,
        amount: 20,
        method: PaymentMethod.CASH,
      }).expect(201);
      await pay({
        memberId: member.memberId,
        membershipId,
        amount: 29.99,
        method: PaymentMethod.CARD,
      }).expect(201);
    });

    it('lists payments for an administrator', async () => {
      const res = await request(server)
        .get('/api/v1/payments')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(2);
    });

    it('filters by method, member and membership', async () => {
      const byMethod = await request(server)
        .get('/api/v1/payments')
        .query({ method: PaymentMethod.CARD })
        .set(...bearer(admin.accessToken))
        .expect(200);
      expect(byMethod.body.meta.total).toBe(1);

      const byMembership = await request(server)
        .get('/api/v1/payments')
        .query({ membershipId })
        .set(...bearer(admin.accessToken))
        .expect(200);
      expect(byMembership.body.meta.total).toBe(2);
    });

    it('filters by date range inclusively of the end day', async () => {
      const res = await request(server)
        .get('/api/v1/payments')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(2);
    });

    it('gives a member their own history without staff notes', async () => {
      await pay({
        memberId: member.memberId,
        amount: 5,
        method: PaymentMethod.CASH,
        notes: 'Paid grudgingly',
      }).expect(201);

      const res = await request(server)
        .get('/api/v1/payments/me')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(3);
      expect(res.body.data[0]).not.toHaveProperty('notes');
      expect(JSON.stringify(res.body)).not.toContain('Paid grudgingly');
    });
  });

  describe('authorization', () => {
    it('a member cannot list all payments', async () => {
      await request(server)
        .get('/api/v1/payments')
        .set(...bearer(member.accessToken))
        .expect(403);
    });

    it("a member cannot read another member's payment", async () => {
      const other = await seedMemberProfile(ctx, server, { email: 'nosy@gym.test' });
      const theirs = await pay({
        memberId: other.memberId,
        amount: 10,
        method: PaymentMethod.CASH,
      }).expect(201);

      await request(server)
        .get(`/api/v1/payments/${theirs.body.id}`)
        .set(...bearer(member.accessToken))
        .expect(404);
    });

    it('a trainer can see no payments at all', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const assigned = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });
      const theirs = await pay({
        memberId: assigned.memberId,
        amount: 10,
        method: PaymentMethod.CASH,
      }).expect(201);

      // Even for a member they manage: money is not a trainer's business.
      await request(server)
        .get(`/api/v1/payments/${theirs.body.id}`)
        .set(...bearer(trainer.accessToken))
        .expect(404);
      await request(server)
        .get('/api/v1/payments')
        .set(...bearer(trainer.accessToken))
        .expect(403);
    });

    it.each([
      ['post', '/api/v1/payments'],
      ['post', '/api/v1/payments/0b5f8a2e-0000-4000-8000-000000000000/refund'],
    ])('%s %s is ADMIN only', async (method, path) => {
      const trainer = await seedTrainerProfile(ctx, server);

      for (const token of [trainer.accessToken, member.accessToken]) {
        const res = await request(server)
          [method as 'post'](path)
          .set(...bearer(token))
          .send({});
        expect(res.status).toBe(403);
      }
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/payments').expect(401);
      await request(server).post('/api/v1/payments').send({}).expect(401);
    });
  });
});
