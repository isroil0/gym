import { PaymentMethod, UserRole } from '@prisma/client';
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

describe('Billing — remaining debt (e2e)', () => {
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
    plan = await seedPlan(ctx, { name: 'Monthly', price: '100.00' });
    const membership = await seedMembership(ctx, member.memberId, plan.id, {
      purchasePrice: '100.00',
    });
    membershipId = membership.id;
  });

  const asAdmin = () => bearer(admin.accessToken);

  const pay = (amount: number, method = PaymentMethod.CASH) =>
    request(server)
      .post('/api/v1/payments')
      .set(...asAdmin())
      .send({ memberId: member.memberId, membershipId, amount, method });

  const billing = () =>
    request(server)
      .get(`/api/v1/billing/members/${member.memberId}`)
      .set(...asAdmin());

  const discount = (amount: number, reason?: string) =>
    request(server)
      .post(`/api/v1/memberships/${membershipId}/discount`)
      .set(...asAdmin())
      .send({ amount, reason });

  describe('the debt follows the money', () => {
    it('starts as the full purchase price', async () => {
      const res = await billing().expect(200);

      expect(res.body.amountDue).toBe('100.00');
      expect(res.body.netPaid).toBe('0.00');
      expect(res.body.outstanding).toBe('100.00');
      expect(res.body.memberships[0].settlementStatus).toBe('UNPAID');
    });

    it('shrinks with each partial payment', async () => {
      await pay(30).expect(201);
      let res = await billing().expect(200);
      expect(res.body.outstanding).toBe('70.00');
      expect(res.body.memberships[0].settlementStatus).toBe('PARTIALLY_PAID');

      await pay(70).expect(201);
      res = await billing().expect(200);
      expect(res.body.outstanding).toBe('0.00');
      expect(res.body.memberships[0].settlementStatus).toBe('PAID');
    });

    it('comes back when a payment is refunded', async () => {
      const payment = await pay(100).expect(201);

      await request(server)
        .post(`/api/v1/payments/${payment.body.id}/refund`)
        .set(...asAdmin())
        .send({ amount: 40, reason: 'Partial cancellation' })
        .expect(200);

      const res = await billing().expect(200);
      expect(res.body.amountRefunded).toBe('40.00');
      expect(res.body.netPaid).toBe('60.00');
      expect(res.body.outstanding).toBe('40.00');
      expect(res.body.memberships[0].settlementStatus).toBe('PARTIALLY_PAID');
    });

    it('returns to fully unpaid when the payment is refunded in full', async () => {
      const payment = await pay(100).expect(201);

      await request(server)
        .post(`/api/v1/payments/${payment.body.id}/refund`)
        .set(...asAdmin())
        .send({ amount: 100, reason: 'Cancelled' })
        .expect(200);

      const res = await billing().expect(200);
      expect(res.body.outstanding).toBe('100.00');
      expect(res.body.memberships[0].settlementStatus).toBe('UNPAID');
    });

    it('records an overpayment as credit, never as negative debt', async () => {
      await pay(120).expect(201);

      const res = await billing().expect(200);
      expect(res.body.balance).toBe('-20.00');
      expect(res.body.outstanding).toBe('0.00');
      expect(res.body.credit).toBe('20.00');
      expect(res.body.memberships[0].settlementStatus).toBe('OVERPAID');
    });

    it('stays exact across awkward part-payments', async () => {
      await ctx.prisma.memberMembership.update({
        where: { id: membershipId },
        data: { purchasePrice: '0.30' },
      });

      await pay(0.1).expect(201);
      await pay(0.2).expect(201);

      const res = await billing().expect(200);
      expect(res.body.outstanding).toBe('0.00');
      expect(res.body.memberships[0].settlementStatus).toBe('PAID');
    });
  });

  describe('discounts', () => {
    it('reduce what is owed without rewriting the purchase price', async () => {
      const applied = await discount(25, 'Student rate').expect(200);

      expect(applied.body.purchasePrice).toBe('100.00');
      expect(applied.body.discountAmount).toBe('25.00');
      expect(applied.body.discountReason).toBe('Student rate');
      expect(applied.body.amountDue).toBe('75.00');

      const res = await billing().expect(200);
      expect(res.body.memberships[0].grossAmount).toBe('100.00');
      expect(res.body.amountDue).toBe('75.00');
      expect(res.body.outstanding).toBe('75.00');
    });

    it('settle the charge when the whole price is discounted', async () => {
      await discount(100, 'Complimentary').expect(200);

      const res = await billing().expect(200);
      expect(res.body.amountDue).toBe('0.00');
      expect(res.body.outstanding).toBe('0.00');
      expect(res.body.memberships[0].settlementStatus).toBe('PAID');
    });

    it('can be removed by sending zero', async () => {
      await discount(25, 'Student rate').expect(200);
      const cleared = await discount(0).expect(200);

      expect(cleared.body.discountAmount).toBe('0.00');
      expect(cleared.body.discountReason).toBeNull();

      const res = await billing().expect(200);
      expect(res.body.outstanding).toBe('100.00');
    });

    it('cannot exceed the purchase price', async () => {
      const res = await discount(150).expect(422);
      expect(res.body.message).toMatch(/exceeds the 100.00 purchase price/);
    });

    it('turn a settled charge into a credit when applied after payment', async () => {
      await pay(100).expect(201);
      await discount(20, 'Retrospective goodwill').expect(200);

      const res = await billing().expect(200);
      expect(res.body.credit).toBe('20.00');
      expect(res.body.memberships[0].settlementStatus).toBe('OVERPAID');
    });

    it('rejects a negative discount', async () => {
      await discount(-10).expect(400);
    });
  });

  describe('across several memberships', () => {
    it('sums the debt and lists each membership', async () => {
      const second = await seedMembership(ctx, member.memberId, plan.id, {
        purchasePrice: '50.00',
        startDate: new Date(Date.UTC(2020, 0, 1)),
        endDate: new Date(Date.UTC(2020, 0, 30)),
      });

      await pay(100).expect(201);

      const res = await billing().expect(200);
      expect(res.body.amountDue).toBe('150.00');
      expect(res.body.netPaid).toBe('100.00');
      expect(res.body.outstanding).toBe('50.00');
      expect(res.body.memberships).toHaveLength(2);

      const unpaid = (
        res.body.memberships as Array<{ membershipId: string; outstanding: string }>
      ).find((m) => m.membershipId === second.id);
      expect(unpaid?.outstanding).toBe('50.00');
    });

    it('reports payments not tied to a membership separately', async () => {
      await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({ memberId: member.memberId, amount: 15, method: PaymentMethod.OTHER })
        .expect(201);

      const res = await billing().expect(200);
      expect(res.body.unallocatedPayments).toBe('15.00');
      // It is revenue, but it does not pay off the membership.
      expect(res.body.outstanding).toBe('100.00');
    });
  });

  describe('GET /billing/outstanding', () => {
    it('lists debtors, largest debt first', async () => {
      const big = await seedMemberProfile(ctx, server, { email: 'big@gym.test' });
      await seedMembership(ctx, big.memberId, plan.id, { purchasePrice: '500.00' });

      const settled = await seedMemberProfile(ctx, server, { email: 'settled@gym.test' });
      const settledMembership = await seedMembership(ctx, settled.memberId, plan.id, {
        purchasePrice: '20.00',
      });
      await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({
          memberId: settled.memberId,
          membershipId: settledMembership.id,
          amount: 20,
          method: PaymentMethod.CASH,
        })
        .expect(201);

      const res = await request(server)
        .get('/api/v1/billing/outstanding')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.meta.total).toBe(2);
      expect(res.body.data[0].email).toBe('big@gym.test');
      expect(res.body.data[0].outstanding).toBe('500.00');
      expect(res.body.data[1].outstanding).toBe('100.00');
      expect(
        (res.body.data as Array<{ email: string }>).some((m) => m.email === 'settled@gym.test'),
      ).toBe(false);
    });

    it('honours a minimum balance', async () => {
      const small = await seedMemberProfile(ctx, server, { email: 'small@gym.test' });
      await seedMembership(ctx, small.memberId, plan.id, { purchasePrice: '5.00' });

      const res = await request(server)
        .get('/api/v1/billing/outstanding')
        .query({ minimumBalance: 50 })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].email).toBe('mia@gym.test');
    });

    it('excludes members with no memberships at all', async () => {
      await seedMemberProfile(ctx, server, { email: 'nothing@gym.test' });

      const res = await request(server)
        .get('/api/v1/billing/outstanding')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
    });

    it('paginates', async () => {
      for (let i = 0; i < 3; i += 1) {
        const debtor = await seedMemberProfile(ctx, server, { email: `debtor${i}@gym.test` });
        await seedMembership(ctx, debtor.memberId, plan.id, { purchasePrice: '10.00' });
      }

      const res = await request(server)
        .get('/api/v1/billing/outstanding')
        .query({ page: 2, limit: 2 })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.meta.total).toBe(4);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('authorization', () => {
    it('a member reads their own position via /billing/me', async () => {
      await pay(30).expect(201);

      const res = await request(server)
        .get('/api/v1/billing/me')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.memberId).toBe(member.memberId);
      expect(res.body.outstanding).toBe('70.00');
    });

    it("a member cannot read another member's position", async () => {
      const other = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });

      await request(server)
        .get(`/api/v1/billing/members/${other.memberId}`)
        .set(...bearer(member.accessToken))
        .expect(403);
    });

    it('a member cannot see the unpaid-balances report', async () => {
      await request(server)
        .get('/api/v1/billing/outstanding')
        .set(...bearer(member.accessToken))
        .expect(403);
    });

    it('a trainer may look up an assigned member but not anyone else', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const assigned = await seedMemberProfile(ctx, server, {
        email: 'assigned@gym.test',
        assignedTrainerId: trainer.trainerId,
      });
      await seedMembership(ctx, assigned.memberId, plan.id, { purchasePrice: '40.00' });

      const ok = await request(server)
        .get(`/api/v1/billing/members/${assigned.memberId}`)
        .set(...bearer(trainer.accessToken))
        .expect(200);
      expect(ok.body.outstanding).toBe('40.00');

      await request(server)
        .get(`/api/v1/billing/members/${member.memberId}`)
        .set(...bearer(trainer.accessToken))
        .expect(403);
    });

    it('a trainer cannot see the unpaid-balances report', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      await request(server)
        .get('/api/v1/billing/outstanding')
        .set(...bearer(trainer.accessToken))
        .expect(403);
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/billing/me').expect(401);
      await request(server).get('/api/v1/billing/outstanding').expect(401);
    });
  });
});
