import {
  AccountingEntryType,
  CheckInMethod,
  MembershipStatus,
  PaymentMethod,
  TrainingSessionStatus,
  UserRole,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import {
  bearer,
  isoDaysFromToday,
  seedAndLogin,
  seedExpenseCategory,
  seedLedgerEntry,
  seedMemberProfile,
  seedMembership,
  seedPlan,
  seedTrainerProfile,
  type SignedInUser,
} from './utils/auth';

const dayOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('Reports (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;
  let month: string;
  let monthStart: string;

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
    month = isoDaysFromToday(0).slice(0, 7);
    monthStart = `${month}-01`;
  });

  const asAdmin = () => bearer(admin.accessToken);
  const today = () => isoDaysFromToday(0);

  const report = (path: string, query: Record<string, unknown> = {}) =>
    request(server)
      .get(`/api/v1/reports/${path}`)
      .query({ from: monthStart, to: today(), ...query })
      .set(...asAdmin());

  describe('period handling, shared by every report', () => {
    it.each([
      'membership-sales',
      'revenue',
      'expenses',
      'profit',
      'attendance',
      'renewals',
      'expired-memberships',
      'trainer-stats',
    ])('%s echoes the period and the zone it used', async (path) => {
      const res = await report(path).expect(200);

      expect(res.body.period).toEqual({
        from: monthStart,
        to: today(),
        timeZone: 'UTC',
      });
    });

    it.each([
      'membership-sales',
      'revenue',
      'expenses',
      'profit',
      'attendance',
      'renewals',
      'expired-memberships',
      'trainer-stats',
    ])('%s rejects a reversed period', async (path) => {
      const res = await report(path, { from: today(), to: isoDaysFromToday(-10) }).expect(422);
      expect(res.body.details).toEqual([{ field: 'to', messages: ['must be on or after from'] }]);
    });

    it.each([
      ['a malformed from', { from: '01/10/2026' }],
      ['a malformed to', { to: '2026-10' }],
      ['a missing from', { from: undefined }],
      ['an unknown grouping', { groupBy: 'week' }],
    ])('rejects %s', async (_label, query) => {
      const params: Record<string, unknown> = { from: monthStart, to: today(), ...query };
      if (params.from === undefined) delete params.from;

      await request(server)
        .get('/api/v1/reports/revenue')
        .query(params as Record<string, string>)
        .set(...asAdmin())
        .expect(400);
    });

    it('returns an empty-but-complete report when nothing happened', async () => {
      const res = await report('revenue').expect(200);

      expect(res.body.income).toBe('0.00');
      expect(res.body.revenue).toBe('0.00');
      expect(res.body.series.length).toBeGreaterThanOrEqual(1);
      expect(res.body.series.every((point: { value: string }) => point.value === '0.00')).toBe(
        true,
      );
    });
  });

  describe('membership sales', () => {
    it('totals what was sold, by plan, splitting renewals from first sales', async () => {
      const monthly = await seedPlan(ctx, { name: 'Monthly', price: '49.99' });
      const annual = await seedPlan(ctx, { name: 'Annual', price: '449.00' });

      const a = await seedMemberProfile(ctx, server, { email: 'a@gym.test' });
      const b = await seedMemberProfile(ctx, server, { email: 'b@gym.test' });

      const first = await request(server)
        .post('/api/v1/memberships')
        .set(...asAdmin())
        .send({ memberId: a.memberId, planId: monthly.id })
        .expect(201);
      await request(server)
        .post('/api/v1/memberships')
        .set(...asAdmin())
        .send({ memberId: b.memberId, planId: annual.id })
        .expect(201);
      await request(server)
        .post(`/api/v1/memberships/${first.body.id}/renew`)
        .set(...asAdmin())
        .send({})
        .expect(201);

      const res = await report('membership-sales').expect(200);

      expect(res.body.totalSold).toBe(3);
      expect(res.body.grossValue).toBe('548.98');
      expect(res.body.renewals).toBe(1);
      expect(res.body.firstTimeSales).toBe(2);

      const monthlyRow = (res.body.byPlan as Array<{ planName: string; sold: number }>).find(
        (row) => row.planName === 'Monthly',
      );
      expect(monthlyRow?.sold).toBe(2);
    });

    it('subtracts discounts from the net value', async () => {
      const plan = await seedPlan(ctx, { price: '100.00' });
      const member = await seedMemberProfile(ctx, server);

      const sold = await request(server)
        .post('/api/v1/memberships')
        .set(...asAdmin())
        .send({ memberId: member.memberId, planId: plan.id })
        .expect(201);
      await request(server)
        .post(`/api/v1/memberships/${sold.body.id}/discount`)
        .set(...asAdmin())
        .send({ amount: 25, reason: 'Student' })
        .expect(200);

      const res = await report('membership-sales').expect(200);

      expect(res.body.grossValue).toBe('100.00');
      expect(res.body.discounts).toBe('25.00');
      expect(res.body.netValue).toBe('75.00');
    });

    it('produces a dense day series', async () => {
      const res = await report('membership-sales', {
        from: isoDaysFromToday(-3),
        to: today(),
      }).expect(200);

      expect(res.body.series).toHaveLength(4);
      expect(res.body.series[0].bucket).toBe(isoDaysFromToday(-3));
    });
  });

  describe('revenue, expenses and profit', () => {
    beforeEach(async () => {
      const category = await seedExpenseCategory(ctx, { name: 'Rent' });
      const other = await seedExpenseCategory(ctx, { name: 'Cleaning' });

      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.INCOME,
        amount: '1000.00',
        occurredOn: today(),
      });
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.REFUND,
        amount: '150.00',
        occurredOn: today(),
      });
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.EXPENSE,
        amount: '300.00',
        occurredOn: today(),
        expenseCategoryId: category.id,
      });
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.EXPENSE,
        amount: '100.00',
        occurredOn: today(),
        expenseCategoryId: other.id,
      });
    });

    it('reports revenue as income less refunds', async () => {
      const res = await report('revenue').expect(200);

      expect(res.body.income).toBe('1000.00');
      expect(res.body.refunds).toBe('150.00');
      expect(res.body.revenue).toBe('850.00');
    });

    it('reports expenses by category with each share', async () => {
      const res = await report('expenses').expect(200);

      expect(res.body.expenses).toBe('400.00');
      expect(res.body.byCategory[0]).toEqual(
        expect.objectContaining({ expenseCategoryName: 'Rent', amount: '300.00', share: 75 }),
      );
      expect(res.body.byCategory[1].share).toBe(25);
    });

    it('reports profit and margin', async () => {
      const res = await report('profit').expect(200);

      expect(res.body.revenue).toBe('850.00');
      expect(res.body.expenses).toBe('400.00');
      expect(res.body.profit).toBe('450.00');
      expect(res.body.marginPercent).toBe(52.9);
    });

    it('reports a null margin when there was no revenue', async () => {
      await ctx.prisma.accountingEntry.deleteMany({
        where: { type: { in: [AccountingEntryType.INCOME, AccountingEntryType.REFUND] } },
      });

      const res = await report('profit').expect(200);
      expect(res.body.revenue).toBe('0.00');
      expect(res.body.marginPercent).toBeNull();
    });

    it('reports a loss as a negative profit', async () => {
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.EXPENSE,
        amount: '5000.00',
        occurredOn: today(),
        expenseCategoryId: (await seedExpenseCategory(ctx)).id,
      });

      const res = await report('profit').expect(200);
      expect(res.body.profit).toBe('-4550.00');
    });

    it('agrees with the accounting summary for the same period', async () => {
      const [revenue, expenses, profit, summary] = await Promise.all([
        report('revenue').expect(200),
        report('expenses').expect(200),
        report('profit').expect(200),
        request(server)
          .get('/api/v1/accounting/summary')
          .query({ from: monthStart, to: today() })
          .set(...asAdmin())
          .expect(200),
      ]);

      expect(revenue.body.revenue).toBe(summary.body.revenue);
      expect(expenses.body.expenses).toBe(summary.body.expenses);
      expect(profit.body.profit).toBe(summary.body.profit);
    });

    it('keeps the three series consistent with each other', async () => {
      const [revenue, expenses, profit] = await Promise.all([
        report('revenue').expect(200),
        report('expenses').expect(200),
        report('profit').expect(200),
      ]);

      const last = (series: Array<{ value?: string; revenue?: string }>) => series.at(-1)!;
      expect(last(revenue.body.series).value).toBe(last(profit.body.series).revenue);
      expect(last(expenses.body.series).value).toBe(
        (last(profit.body.series) as unknown as { expenses: string }).expenses,
      );
    });

    it('excludes voided entries', async () => {
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.INCOME,
        amount: '999.00',
        occurredOn: today(),
        voided: true,
      });

      const res = await report('revenue').expect(200);
      expect(res.body.income).toBe('1000.00');
    });

    it('groups by month when asked', async () => {
      const res = await report('revenue', {
        from: `${month}-01`,
        to: today(),
        groupBy: 'month',
      }).expect(200);

      expect(res.body.series).toHaveLength(1);
      expect(res.body.series[0].bucket).toBe(month);
      expect(res.body.series[0].value).toBe('850.00');
    });

    it('splits income and refunds by payment method', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);
      const membership = await seedMembership(ctx, member.memberId, plan.id);

      const payment = await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({
          memberId: member.memberId,
          membershipId: membership.id,
          amount: 30,
          method: PaymentMethod.CARD,
        })
        .expect(201);
      await request(server)
        .post(`/api/v1/payments/${payment.body.id}/refund`)
        .set(...asAdmin())
        .send({ amount: 10, reason: 'Partial' })
        .expect(200);

      const res = await report('revenue').expect(200);
      const card = (
        res.body.byPaymentMethod as Array<{ method: string; income: string; refunds: string }>
      ).find((row) => row.method === PaymentMethod.CARD);

      expect(card).toEqual({ method: PaymentMethod.CARD, income: '30.00', refunds: '10.00' });
    });
  });

  describe('attendance', () => {
    it('counts visits and distinct members, and averages per day', async () => {
      const plan = await seedPlan(ctx);
      const a = await seedMemberProfile(ctx, server, { email: 'a@gym.test' });
      const b = await seedMemberProfile(ctx, server, { email: 'b@gym.test' });
      await seedMembership(ctx, a.memberId, plan.id);
      await seedMembership(ctx, b.memberId, plan.id);

      // Two visits by A, one by B, all today.
      for (const [memberId, hour] of [
        [a.memberId, '08'],
        [a.memberId, '18'],
        [b.memberId, '18'],
      ] as const) {
        await ctx.prisma.attendance.create({
          data: {
            memberId,
            method: CheckInMethod.QR,
            checkedInAt: new Date(`${today()}T${hour}:00:00.000Z`),
            checkedOutAt: new Date(`${today()}T${hour}:45:00.000Z`),
          },
        });
      }

      const res = await report('attendance', { from: today(), to: today() }).expect(200);

      expect(res.body.totalVisits).toBe(3);
      expect(res.body.uniqueMembers).toBe(2);
      expect(res.body.averageVisitsPerDay).toBe(3);
      expect(res.body.averageDurationMinutes).toBe(45);
      expect(res.body.byMethod).toEqual({ MANUAL: 0, QR: 3 });
      expect(res.body.busiestHours[0]).toEqual({ hour: 18, visits: 2 });
      expect(res.body.series).toEqual([{ bucket: today(), visits: 3, uniqueMembers: 2 }]);
    });

    it('ignores open visits when averaging duration', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);
      await seedMembership(ctx, member.memberId, plan.id);

      await ctx.prisma.attendance.create({
        data: {
          memberId: member.memberId,
          method: CheckInMethod.MANUAL,
          checkedInAt: new Date(`${today()}T09:00:00.000Z`),
        },
      });

      const res = await report('attendance', { from: today(), to: today() }).expect(200);
      expect(res.body.totalVisits).toBe(1);
      expect(res.body.averageDurationMinutes).toBeNull();
    });

    it('averages across the whole period, not just the days with visits', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);
      await seedMembership(ctx, member.memberId, plan.id);

      await ctx.prisma.attendance.create({
        data: {
          memberId: member.memberId,
          method: CheckInMethod.MANUAL,
          checkedInAt: new Date(`${today()}T09:00:00.000Z`),
        },
      });

      // One visit over four days.
      const res = await report('attendance', { from: isoDaysFromToday(-3), to: today() }).expect(
        200,
      );
      expect(res.body.averageVisitsPerDay).toBe(0.3);
      expect(res.body.series).toHaveLength(4);
    });
  });

  describe('renewals', () => {
    it('reports renewals, the gap between terms and plan changes', async () => {
      const monthly = await seedPlan(ctx, { name: 'Monthly', durationDays: 30, price: '49.99' });
      const annual = await seedPlan(ctx, { name: 'Annual', durationDays: 365, price: '449.00' });
      const member = await seedMemberProfile(ctx, server);

      const first = await request(server)
        .post('/api/v1/memberships')
        .set(...asAdmin())
        .send({ memberId: member.memberId, planId: monthly.id, startDate: today() })
        .expect(201);
      await request(server)
        .post(`/api/v1/memberships/${first.body.id}/renew`)
        .set(...asAdmin())
        .send({ planId: annual.id })
        .expect(201);

      const res = await report('renewals').expect(200);

      expect(res.body.totalRenewals).toBe(1);
      expect(res.body.renewalValue).toBe('449.00');
      expect(res.body.planChanges).toBe(1);
      expect(res.body.renewals[0]).toEqual(
        expect.objectContaining({
          planName: 'Annual',
          previousPlanName: 'Monthly',
          // Renewal starts the day after the old term ends, so no gap.
          gapDays: 0,
          planChanged: true,
        }),
      );
    });

    it('counts memberships that ended without being renewed, and the rate', async () => {
      const plan = await seedPlan(ctx);

      const lapsed = await seedMemberProfile(ctx, server, { email: 'lapsed@gym.test' });
      await seedMembership(ctx, lapsed.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-20)),
        endDate: dayOf(isoDaysFromToday(-1)),
        status: MembershipStatus.EXPIRED,
      });

      const renewed = await seedMemberProfile(ctx, server, { email: 'renewed@gym.test' });
      const old = await seedMembership(ctx, renewed.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-20)),
        endDate: dayOf(isoDaysFromToday(-1)),
        status: MembershipStatus.EXPIRED,
      });
      await request(server)
        .post(`/api/v1/memberships/${old.id}/renew`)
        .set(...asAdmin())
        .send({})
        .expect(201);

      const res = await report('renewals', { from: isoDaysFromToday(-30), to: today() }).expect(
        200,
      );

      expect(res.body.lapsedWithoutRenewal).toBe(1);
      expect(res.body.renewalRatePercent).toBe(50);
    });

    it('reports a null rate when nothing ended in the period', async () => {
      const res = await report('renewals').expect(200);

      expect(res.body.totalRenewals).toBe(0);
      expect(res.body.renewalRatePercent).toBeNull();
    });
  });

  describe('expired memberships', () => {
    it('lists what lapsed and who came back', async () => {
      const plan = await seedPlan(ctx);

      const gone = await seedMemberProfile(ctx, server, { email: 'gone@gym.test' });
      await seedMembership(ctx, gone.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-40)),
        endDate: dayOf(isoDaysFromToday(-10)),
        status: MembershipStatus.EXPIRED,
      });

      const back = await seedMemberProfile(ctx, server, { email: 'back@gym.test' });
      await seedMembership(ctx, back.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-40)),
        endDate: dayOf(isoDaysFromToday(-10)),
        status: MembershipStatus.EXPIRED,
      });
      await seedMembership(ctx, back.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-5)),
        endDate: dayOf(isoDaysFromToday(25)),
      });

      const res = await report('expired-memberships', {
        from: isoDaysFromToday(-30),
        to: today(),
      }).expect(200);

      expect(res.body.totalExpired).toBe(2);
      expect(res.body.returned).toBe(1);
      expect(res.body.notReturned).toBe(1);

      const rows = res.body.expired as Array<{
        email: string;
        renewed: boolean;
        daysSinceExpiry: number;
      }>;
      expect(rows.find((row) => row.email === 'back@gym.test')?.renewed).toBe(true);
      expect(rows.find((row) => row.email === 'gone@gym.test')?.renewed).toBe(false);
      expect(rows[0].daysSinceExpiry).toBe(10);
    });

    it('includes cancelled memberships, not only naturally expired ones', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-10)),
        endDate: dayOf(isoDaysFromToday(-2)),
        status: MembershipStatus.CANCELLED,
      });

      const res = await report('expired-memberships', {
        from: isoDaysFromToday(-30),
        to: today(),
      }).expect(200);

      expect(res.body.totalExpired).toBe(1);
      expect(res.body.expired[0].status).toBe(MembershipStatus.CANCELLED);
    });
  });

  describe('unpaid balances', () => {
    it('lists debtors largest first with the total and the mean', async () => {
      const plan = await seedPlan(ctx, { price: '100.00' });

      for (const [email, price] of [
        ['big@gym.test', '300.00'],
        ['small@gym.test', '100.00'],
      ] as const) {
        const member = await seedMemberProfile(ctx, server, { email });
        await seedMembership(ctx, member.memberId, plan.id, { purchasePrice: price });
      }

      const settled = await seedMemberProfile(ctx, server, { email: 'settled@gym.test' });
      const membership = await seedMembership(ctx, settled.memberId, plan.id, {
        purchasePrice: '50.00',
      });
      await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({
          memberId: settled.memberId,
          membershipId: membership.id,
          amount: 50,
          method: PaymentMethod.CASH,
        })
        .expect(201);

      const res = await request(server)
        .get('/api/v1/reports/unpaid-balances')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.membersInDebt).toBe(2);
      expect(res.body.totalOutstanding).toBe('400.00');
      expect(res.body.averageOutstanding).toBe('200.00');
      expect(res.body.balances[0].outstanding).toBe('300.00');
      expect(res.body.balances.map((row: { email: string }) => row.email)).not.toContain(
        'settled@gym.test',
      );
    });

    it('is empty and safe when nobody owes anything', async () => {
      const res = await request(server)
        .get('/api/v1/reports/unpaid-balances')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.membersInDebt).toBe(0);
      expect(res.body.totalOutstanding).toBe('0.00');
      expect(res.body.averageOutstanding).toBe('0.00');
      expect(res.body.balances).toEqual([]);
    });
  });

  describe('trainer stats', () => {
    it('reports sessions, completion rate, coached minutes and plans written', async () => {
      const trainer = await seedTrainerProfile(ctx, server, { firstName: 'Tina' });
      const member = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });

      for (const [hour, status] of [
        ['08', TrainingSessionStatus.COMPLETED],
        ['10', TrainingSessionStatus.COMPLETED],
        ['12', TrainingSessionStatus.NO_SHOW],
        ['14', TrainingSessionStatus.CANCELLED],
        ['16', TrainingSessionStatus.SCHEDULED],
      ] as const) {
        await ctx.prisma.trainingSession.create({
          data: {
            trainerId: trainer.trainerId,
            memberId: member.memberId,
            startsAt: new Date(`${today()}T${hour}:00:00.000Z`),
            endsAt: new Date(`${today()}T${hour}:30:00.000Z`),
            status,
          },
        });
      }

      await ctx.prisma.workoutPlan.create({
        data: { memberId: member.memberId, trainerId: trainer.trainerId, name: 'Block A' },
      });

      const res = await report('trainer-stats').expect(200);
      const row = res.body.stats[0];

      expect(res.body.trainers).toBe(1);
      expect(row.assignedMembers).toBe(1);
      expect(row.sessionsScheduled).toBe(5);
      expect(row.sessionsCompleted).toBe(2);
      expect(row.sessionsCancelled).toBe(1);
      expect(row.noShows).toBe(1);
      // A cancellation freed the slot, so it was never due; a no-show was.
      expect(row.completionRatePercent).toBe(66.7);
      expect(row.coachedMinutes).toBe(60);
      expect(row.plansWritten).toBe(1);
      expect(row.attributedCost).toBe('0.00');
    });

    it('includes expenses attributed to the trainer', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const category = await seedExpenseCategory(ctx, { name: 'Trainer Salary' });

      await request(server)
        .post('/api/v1/accounting/entries')
        .set(...asAdmin())
        .send({
          type: AccountingEntryType.EXPENSE,
          amount: 2500,
          occurredOn: today(),
          description: 'October salary',
          expenseCategoryId: category.id,
          trainerId: trainer.trainerId,
        })
        .expect(201);

      const res = await report('trainer-stats').expect(200);
      expect(res.body.stats[0].attributedCost).toBe('2500.00');
    });

    it('reports a null completion rate when no sessions were due', async () => {
      await seedTrainerProfile(ctx, server);

      const res = await report('trainer-stats').expect(200);
      expect(res.body.stats[0].completionRatePercent).toBeNull();
      expect(res.body.stats[0].coachedMinutes).toBe(0);
    });

    it('excludes archived trainers', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      await request(server)
        .post(`/api/v1/trainers/${trainer.trainerId}/archive`)
        .set(...asAdmin())
        .expect(200);

      const res = await report('trainer-stats').expect(200);
      expect(res.body.trainers).toBe(0);
      expect(res.body.stats).toEqual([]);
    });

    it('is empty and safe with no trainers at all', async () => {
      const res = await report('trainer-stats').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ trainers: 0, stats: [] }));
    });
  });

  describe('authorization', () => {
    it.each([
      'membership-sales',
      'revenue',
      'expenses',
      'profit',
      'attendance',
      'renewals',
      'expired-memberships',
      'unpaid-balances',
      'trainer-stats',
    ])('%s is ADMIN only', async (path) => {
      const trainer = await seedTrainerProfile(ctx, server);
      const member = await seedMemberProfile(ctx, server);

      for (const token of [trainer.accessToken, member.accessToken]) {
        await request(server)
          .get(`/api/v1/reports/${path}`)
          .query({ from: monthStart, to: today() })
          .set(...bearer(token))
          .expect(403);
      }
    });

    it('requires authentication', async () => {
      await request(server)
        .get('/api/v1/reports/revenue')
        .query({ from: monthStart, to: today() })
        .expect(401);
    });
  });
});
