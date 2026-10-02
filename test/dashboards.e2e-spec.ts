import {
  AccountingEntryType,
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

describe('Dashboards (e2e)', () => {
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
  const dayOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  describe('admin dashboard', () => {
    it('reports an empty gym without dividing by zero or omitting fields', async () => {
      const res = await request(server)
        .get('/api/v1/dashboard/admin')
        .set(...asAdmin())
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          date: isoDaysFromToday(0),
          timeZone: 'UTC',
          activeMembers: 0,
          expiredMembers: 0,
          totalMembers: 0,
          todayCheckIns: 0,
          currentlyInside: 0,
          monthlyRevenue: '0.00',
          monthlyExpenses: '0.00',
          monthlyProfit: '0.00',
          totalOutstanding: '0.00',
          membersInDebt: 0,
          newMembersThisMonth: 0,
          activeTrainers: 0,
          sessionsToday: 0,
        }),
      );
      expect(res.body.expiringSoon).toEqual([]);
      expect(res.body.topDebtors).toEqual([]);
    });

    it('counts active, expired and membership-less members separately', async () => {
      const plan = await seedPlan(ctx);

      const active = await seedMemberProfile(ctx, server, { email: 'active@gym.test' });
      await seedMembership(ctx, active.memberId, plan.id);

      const expired = await seedMemberProfile(ctx, server, { email: 'expired@gym.test' });
      await seedMembership(ctx, expired.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-60)),
        endDate: dayOf(isoDaysFromToday(-30)),
        status: MembershipStatus.EXPIRED,
      });

      await seedMemberProfile(ctx, server, { email: 'never@gym.test' });

      const res = await request(server)
        .get('/api/v1/dashboard/admin')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.activeMembers).toBe(1);
      expect(res.body.expiredMembers).toBe(1);
      expect(res.body.membersWithoutMembership).toBe(1);
      expect(res.body.totalMembers).toBe(3);
    });

    it('lists memberships lapsing inside the window, soonest first', async () => {
      const plan = await seedPlan(ctx);

      for (const [email, days] of [
        ['soon@gym.test', 3],
        ['later@gym.test', 20],
        ['far@gym.test', 90],
      ] as const) {
        const member = await seedMemberProfile(ctx, server, { email });
        await seedMembership(ctx, member.memberId, plan.id, {
          startDate: dayOf(isoDaysFromToday(0)),
          endDate: dayOf(isoDaysFromToday(days)),
        });
      }

      const res = await request(server)
        .get('/api/v1/dashboard/admin')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.expiringSoonCount).toBe(2);
      expect(res.body.expiringSoon[0].daysRemaining).toBe(4);
      expect(res.body.expiringSoon[0].endDate.slice(0, 10)).toBe(isoDaysFromToday(3));
    });

    it('honours a custom look-ahead window', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(0)),
        endDate: dayOf(isoDaysFromToday(60)),
      });

      const narrow = await request(server)
        .get('/api/v1/dashboard/admin')
        .query({ withinDays: 7 })
        .set(...asAdmin())
        .expect(200);
      expect(narrow.body.expiringSoonCount).toBe(0);

      const wide = await request(server)
        .get('/api/v1/dashboard/admin')
        .query({ withinDays: 90 })
        .set(...asAdmin())
        .expect(200);
      expect(wide.body.expiringSoonCount).toBe(1);
    });

    it('rejects an out-of-range window', async () => {
      await request(server)
        .get('/api/v1/dashboard/admin')
        .query({ withinDays: 0 })
        .set(...asAdmin())
        .expect(400);
    });

    it("counts today's check-ins and who is inside right now", async () => {
      const plan = await seedPlan(ctx);
      const a = await seedMemberProfile(ctx, server, { email: 'a@gym.test' });
      const b = await seedMemberProfile(ctx, server, { email: 'b@gym.test' });
      await seedMembership(ctx, a.memberId, plan.id);
      await seedMembership(ctx, b.memberId, plan.id);

      for (const member of [a, b]) {
        await request(server)
          .post('/api/v1/attendance/check-in')
          .set(...asAdmin())
          .send({ memberId: member.memberId })
          .expect(201);
      }
      await request(server)
        .post('/api/v1/attendance/check-out')
        .set(...asAdmin())
        .send({ memberId: a.memberId })
        .expect(200);

      const res = await request(server)
        .get('/api/v1/dashboard/admin')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.todayCheckIns).toBe(2);
      expect(res.body.currentlyInside).toBe(1);
    });

    it('reports revenue, expenses and profit that agree with the ledger', async () => {
      const category = await seedExpenseCategory(ctx);

      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.INCOME,
        amount: '1000.00',
        occurredOn: isoDaysFromToday(0),
      });
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.REFUND,
        amount: '150.00',
        occurredOn: isoDaysFromToday(0),
      });
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.EXPENSE,
        amount: '400.00',
        occurredOn: isoDaysFromToday(0),
        expenseCategoryId: category.id,
      });

      const dashboard = await request(server)
        .get('/api/v1/dashboard/admin')
        .set(...asAdmin())
        .expect(200);

      expect(dashboard.body.monthlyRevenue).toBe('850.00');
      expect(dashboard.body.monthlyExpenses).toBe('400.00');
      expect(dashboard.body.monthlyProfit).toBe('450.00');

      // The same figures the accounting module reports for the month.
      const month = isoDaysFromToday(0).slice(0, 7);
      const summary = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: `${month}-01`, to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);

      expect(dashboard.body.monthlyRevenue).toBe(summary.body.revenue);
      expect(dashboard.body.monthlyProfit).toBe(summary.body.profit);
    });

    it('surfaces the largest debtors and agrees with the billing report', async () => {
      const plan = await seedPlan(ctx, { price: '100.00' });

      for (const [email, price] of [
        ['big@gym.test', '500.00'],
        ['small@gym.test', '50.00'],
      ] as const) {
        const member = await seedMemberProfile(ctx, server, { email });
        await seedMembership(ctx, member.memberId, plan.id, { purchasePrice: price });
      }

      const res = await request(server)
        .get('/api/v1/dashboard/admin')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.membersInDebt).toBe(2);
      expect(res.body.totalOutstanding).toBe('550.00');
      expect(res.body.topDebtors[0].outstanding).toBe('500.00');

      const report = await request(server)
        .get('/api/v1/reports/unpaid-balances')
        .set(...asAdmin())
        .expect(200);
      expect(report.body.totalOutstanding).toBe(res.body.totalOutstanding);
    });

    it('counts new members and memberships sold this month', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);
      await seedMembership(ctx, member.memberId, plan.id);

      const stale = await seedMemberProfile(ctx, server, { email: 'old@gym.test' });
      await ctx.prisma.member.update({
        where: { id: stale.memberId },
        data: { joinedAt: new Date(`${isoDaysFromToday(-200)}T00:00:00.000Z`) },
      });

      const res = await request(server)
        .get('/api/v1/dashboard/admin')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.newMembersThisMonth).toBe(1);
      expect(res.body.membershipsSoldThisMonth).toBe(1);
    });

    it('counts active trainers and sessions today', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const member = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });
      await ctx.prisma.trainingSession.create({
        data: {
          trainerId: trainer.trainerId,
          memberId: member.memberId,
          startsAt: new Date(`${isoDaysFromToday(0)}T09:00:00.000Z`),
          endsAt: new Date(`${isoDaysFromToday(0)}T10:00:00.000Z`),
        },
      });

      const res = await request(server)
        .get('/api/v1/dashboard/admin')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.activeTrainers).toBe(1);
      expect(res.body.sessionsToday).toBe(1);
    });

    it('expires a stale membership before counting, rather than reporting it active', async () => {
      const plan = await seedPlan(ctx);
      const member = await seedMemberProfile(ctx, server);
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-40)),
        endDate: dayOf(isoDaysFromToday(-1)),
        status: MembershipStatus.ACTIVE,
      });

      const res = await request(server)
        .get('/api/v1/dashboard/admin')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.activeMembers).toBe(0);
      expect(res.body.expiredMembers).toBe(1);
    });
  });

  describe('trainer dashboard', () => {
    let trainer: Awaited<ReturnType<typeof seedTrainerProfile>>;
    let plan: Awaited<ReturnType<typeof seedPlan>>;

    beforeEach(async () => {
      trainer = await seedTrainerProfile(ctx, server, { email: 'tina@gym.test' });
      plan = await seedPlan(ctx);
    });

    const asTrainer = () => bearer(trainer.accessToken);

    it('reports an empty roster cleanly', async () => {
      const res = await request(server)
        .get('/api/v1/dashboard/trainer')
        .set(...asTrainer())
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          trainerId: trainer.trainerId,
          assignedMembers: 0,
          assignedMembersActive: 0,
          sessionsCompletedThisMonth: 0,
          noShowsThisMonth: 0,
          activeWorkoutPlans: 0,
        }),
      );
      expect(res.body.sessionsToday).toEqual([]);
      expect(res.body.memberActivity).toEqual([]);
    });

    it('counts assigned members and how many hold an active membership', async () => {
      const withMembership = await seedMemberProfile(ctx, server, {
        email: 'withm@gym.test',
        assignedTrainerId: trainer.trainerId,
      });
      await seedMembership(ctx, withMembership.memberId, plan.id);
      await seedMemberProfile(ctx, server, {
        email: 'without@gym.test',
        assignedTrainerId: trainer.trainerId,
      });
      // Somebody else's member must not be counted.
      await seedMemberProfile(ctx, server, { email: 'other@gym.test' });

      const res = await request(server)
        .get('/api/v1/dashboard/trainer')
        .set(...asTrainer())
        .expect(200);

      expect(res.body.assignedMembers).toBe(2);
      expect(res.body.assignedMembersActive).toBe(1);
    });

    it("separates today's sessions from upcoming ones", async () => {
      const member = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });

      // Distinct slots: a trainer cannot be double-booked, which the database
      // now enforces as well as the application.
      for (const [offset, hour] of [
        [0, 9],
        [0, 11],
        [3, 9],
      ] as const) {
        const pad = (value: number) => String(value).padStart(2, '0');

        await ctx.prisma.trainingSession.create({
          data: {
            trainerId: trainer.trainerId,
            memberId: member.memberId,
            startsAt: new Date(`${isoDaysFromToday(offset)}T${pad(hour)}:00:00.000Z`),
            endsAt: new Date(`${isoDaysFromToday(offset)}T${pad(hour + 1)}:00:00.000Z`),
          },
        });
      }

      const res = await request(server)
        .get('/api/v1/dashboard/trainer')
        .set(...asTrainer())
        .expect(200);

      expect(res.body.sessionsToday).toHaveLength(2);
      expect(res.body.upcomingSessions).toHaveLength(1);
      expect(res.body.upcomingSessions[0].startsAt.slice(0, 10)).toBe(isoDaysFromToday(3));
    });

    it('tallies completed sessions and no-shows for the month', async () => {
      const member = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });

      for (const [hour, status] of [
        ['08', TrainingSessionStatus.COMPLETED],
        ['11', TrainingSessionStatus.COMPLETED],
        ['13', TrainingSessionStatus.NO_SHOW],
        ['15', TrainingSessionStatus.CANCELLED],
      ] as const) {
        await ctx.prisma.trainingSession.create({
          data: {
            trainerId: trainer.trainerId,
            memberId: member.memberId,
            startsAt: new Date(`${isoDaysFromToday(0)}T${hour}:00:00.000Z`),
            endsAt: new Date(`${isoDaysFromToday(0)}T${hour}:45:00.000Z`),
            status,
          },
        });
      }

      const res = await request(server)
        .get('/api/v1/dashboard/trainer')
        .set(...asTrainer())
        .expect(200);

      expect(res.body.sessionsCompletedThisMonth).toBe(2);
      expect(res.body.noShowsThisMonth).toBe(1);
    });

    it('orders member activity least recently seen first, flagging who to chase', async () => {
      const recent = await seedMemberProfile(ctx, server, {
        email: 'recent@gym.test',
        assignedTrainerId: trainer.trainerId,
      });
      const stale = await seedMemberProfile(ctx, server, {
        email: 'stale@gym.test',
        assignedTrainerId: trainer.trainerId,
      });
      const never = await seedMemberProfile(ctx, server, {
        email: 'never@gym.test',
        assignedTrainerId: trainer.trainerId,
      });

      await ctx.prisma.attendance.create({
        data: {
          memberId: recent.memberId,
          method: 'MANUAL',
          checkedInAt: new Date(`${isoDaysFromToday(0)}T09:00:00.000Z`),
          checkedOutAt: new Date(`${isoDaysFromToday(0)}T10:00:00.000Z`),
        },
      });
      await ctx.prisma.attendance.create({
        data: {
          memberId: stale.memberId,
          method: 'MANUAL',
          checkedInAt: new Date(`${isoDaysFromToday(-30)}T09:00:00.000Z`),
          checkedOutAt: new Date(`${isoDaysFromToday(-30)}T10:00:00.000Z`),
        },
      });

      const res = await request(server)
        .get('/api/v1/dashboard/trainer')
        .set(...asTrainer())
        .expect(200);

      const activity = res.body.memberActivity as Array<{
        memberId: string;
        daysSinceLastVisit: number | null;
        visitsThisMonth: number;
        needsAttention: boolean;
      }>;

      // Never-seen first, then longest absent, then the keen one.
      expect(activity[0].memberId).toBe(never.memberId);
      expect(activity[0].daysSinceLastVisit).toBeNull();
      expect(activity[0].needsAttention).toBe(true);

      expect(activity[1].memberId).toBe(stale.memberId);
      expect(activity[1].daysSinceLastVisit).toBe(30);
      expect(activity[1].needsAttention).toBe(true);

      expect(activity[2].memberId).toBe(recent.memberId);
      expect(activity[2].daysSinceLastVisit).toBe(0);
      expect(activity[2].visitsThisMonth).toBe(1);
      expect(activity[2].needsAttention).toBe(false);
    });

    it("counts only the trainer's own active workout plans", async () => {
      const member = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });

      await ctx.prisma.workoutPlan.create({
        data: { memberId: member.memberId, trainerId: trainer.trainerId, name: 'Mine' },
      });
      await ctx.prisma.workoutPlan.create({
        data: {
          memberId: member.memberId,
          trainerId: trainer.trainerId,
          name: 'Retired',
          status: 'ARCHIVED',
        },
      });
      await ctx.prisma.workoutPlan.create({
        data: { memberId: member.memberId, name: 'Written by an admin' },
      });

      const res = await request(server)
        .get('/api/v1/dashboard/trainer')
        .set(...asTrainer())
        .expect(200);

      expect(res.body.activeWorkoutPlans).toBe(1);
    });

    it('explains a trainer account with no profile', async () => {
      const orphan = await seedAndLogin(ctx, server, { role: UserRole.TRAINER });

      const res = await request(server)
        .get('/api/v1/dashboard/trainer')
        .set(...bearer(orphan.accessToken))
        .expect(404);

      expect(res.body.message).toMatch(/Trainer profile for the current account/);
    });
  });

  describe('member dashboard', () => {
    let member: Awaited<ReturnType<typeof seedMemberProfile>>;
    let plan: Awaited<ReturnType<typeof seedPlan>>;

    beforeEach(async () => {
      plan = await seedPlan(ctx, { name: 'Monthly Unlimited', price: '49.99' });
      member = await seedMemberProfile(ctx, server, { email: 'mia@gym.test' });
    });

    const asMember = () => bearer(member.accessToken);

    it('reports a member with no membership without failing', async () => {
      const res = await request(server)
        .get('/api/v1/dashboard/member')
        .set(...asMember())
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          memberId: member.memberId,
          membershipStatus: null,
          daysRemaining: null,
          visitsRemaining: null,
          unlimitedVisits: false,
          canCheckInNow: false,
          assignedTrainer: null,
          visitsThisMonth: 0,
          visitsAllTime: 0,
          nextSession: null,
          workoutPlanId: null,
          outstandingBalance: '0.00',
        }),
      );
    });

    it('reports membership status, days left and unlimited visits', async () => {
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(0)),
        endDate: dayOf(isoDaysFromToday(29)),
      });

      const res = await request(server)
        .get('/api/v1/dashboard/member')
        .set(...asMember())
        .expect(200);

      expect(res.body.membershipStatus).toBe(MembershipStatus.ACTIVE);
      expect(res.body.membershipPlanName).toBe('Monthly Unlimited');
      expect(res.body.daysRemaining).toBe(30);
      expect(res.body.visitsRemaining).toBeNull();
      expect(res.body.unlimitedVisits).toBe(true);
      expect(res.body.canCheckInNow).toBe(true);
    });

    it('reports remaining visits on a limited pack', async () => {
      const pack = await seedPlan(ctx, { name: 'Ten Pack', visitLimit: 10 });
      await seedMembership(ctx, member.memberId, pack.id, { visitLimit: 10, visitsUsed: 4 });

      const res = await request(server)
        .get('/api/v1/dashboard/member')
        .set(...asMember())
        .expect(200);

      expect(res.body.visitsRemaining).toBe(6);
      expect(res.body.unlimitedVisits).toBe(false);
    });

    it('says they cannot come in when the pack is used up', async () => {
      const pack = await seedPlan(ctx, { name: 'One Pack', visitLimit: 1 });
      await seedMembership(ctx, member.memberId, pack.id, { visitLimit: 1, visitsUsed: 1 });

      const res = await request(server)
        .get('/api/v1/dashboard/member')
        .set(...asMember())
        .expect(200);

      expect(res.body.visitsRemaining).toBe(0);
      expect(res.body.canCheckInNow).toBe(false);
    });

    it('agrees with the door: frozen means no entry', async () => {
      await seedMembership(ctx, member.memberId, plan.id, {
        status: MembershipStatus.FROZEN,
        frozenAt: new Date(),
      });

      const res = await request(server)
        .get('/api/v1/dashboard/member')
        .set(...asMember())
        .expect(200);

      expect(res.body.membershipStatus).toBe(MembershipStatus.FROZEN);
      expect(res.body.daysRemaining).toBeNull();
      expect(res.body.canCheckInNow).toBe(false);

      const refused = await request(server)
        .post('/api/v1/attendance/check-in')
        .set(...asAdmin())
        .send({ memberId: member.memberId })
        .expect(422);
      expect(refused.body.details[0].messages[0]).toBe('MEMBERSHIP_FROZEN');
    });

    it('says they cannot come in again while already inside', async () => {
      await seedMembership(ctx, member.memberId, plan.id);
      await request(server)
        .post('/api/v1/attendance/check-in')
        .set(...asAdmin())
        .send({ memberId: member.memberId })
        .expect(201);

      const res = await request(server)
        .get('/api/v1/dashboard/member')
        .set(...asMember())
        .expect(200);

      expect(res.body.currentlyInside).toBe(true);
      expect(res.body.canCheckInNow).toBe(false);
      expect(res.body.visitsThisMonth).toBe(1);
      expect(res.body.visitsAllTime).toBe(1);
      expect(res.body.lastVisitAt).not.toBeNull();
    });

    it('reports the assigned trainer, next session, plan and balance', async () => {
      const trainer = await seedTrainerProfile(ctx, server, {
        firstName: 'Tina',
        specialization: 'Strength',
      });
      await ctx.prisma.member.update({
        where: { id: member.memberId },
        data: { assignedTrainerId: trainer.trainerId },
      });
      await seedMembership(ctx, member.memberId, plan.id, { purchasePrice: '49.99' });

      await ctx.prisma.trainingSession.create({
        data: {
          trainerId: trainer.trainerId,
          memberId: member.memberId,
          startsAt: new Date(`${isoDaysFromToday(5)}T09:00:00.000Z`),
          endsAt: new Date(`${isoDaysFromToday(5)}T10:00:00.000Z`),
        },
      });
      // A past session must not be offered as "next".
      await ctx.prisma.trainingSession.create({
        data: {
          trainerId: trainer.trainerId,
          memberId: member.memberId,
          startsAt: new Date(`${isoDaysFromToday(-5)}T09:00:00.000Z`),
          endsAt: new Date(`${isoDaysFromToday(-5)}T10:00:00.000Z`),
          status: TrainingSessionStatus.COMPLETED,
        },
      });

      const plan2 = await ctx.prisma.workoutPlan.create({
        data: { memberId: member.memberId, trainerId: trainer.trainerId, name: 'Strength block' },
      });
      await ctx.prisma.workoutDay.create({
        data: { planId: plan2.id, dayOrder: 1, name: 'Push' },
      });

      await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({
          memberId: member.memberId,
          amount: 20,
          method: PaymentMethod.CASH,
        })
        .expect(201);

      const res = await request(server)
        .get('/api/v1/dashboard/member')
        .set(...asMember())
        .expect(200);

      expect(res.body.assignedTrainer).toEqual(
        expect.objectContaining({
          name: expect.stringContaining('Tina'),
          specialization: 'Strength',
        }),
      );
      expect(res.body.nextSession.startsAt.slice(0, 10)).toBe(isoDaysFromToday(5));
      expect(res.body.workoutPlanName).toBe('Strength block');
      expect(res.body.workoutPlanDays).toBe(1);
      // The unlinked payment is revenue but does not settle the membership.
      expect(res.body.outstandingBalance).toBe('49.99');
    });

    it('explains a member account with no profile', async () => {
      const orphan = await seedAndLogin(ctx, server, { role: UserRole.MEMBER });

      await request(server)
        .get('/api/v1/dashboard/member')
        .set(...bearer(orphan.accessToken))
        .expect(404);
    });
  });

  describe('authorization', () => {
    it.each([
      ['admin', UserRole.TRAINER],
      ['admin', UserRole.MEMBER],
      ['trainer', UserRole.ADMIN],
      ['trainer', UserRole.MEMBER],
      ['member', UserRole.ADMIN],
      ['member', UserRole.TRAINER],
    ])('refuses the %s dashboard to a %s', async (path, role) => {
      const user = await seedAndLogin(ctx, server, { role });

      await request(server)
        .get(`/api/v1/dashboard/${path}`)
        .set(...bearer(user.accessToken))
        .expect(403);
    });

    it.each(['admin', 'trainer', 'member'])('requires authentication for %s', async (path) => {
      await request(server).get(`/api/v1/dashboard/${path}`).expect(401);
    });
  });
});
