import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import { isoDaysFromToday } from './utils/auth';

/**
 * PHASE 10 — full backend acceptance.
 *
 * One continuous run through the gym's real working day, in order, driven
 * entirely through the HTTP API. The database is touched only to *verify* what
 * the API did, and in one place to simulate the passage of time — never to
 * create or change business data, because an acceptance test that writes
 * directly proves nothing about the API.
 *
 * Jest runs the cases in a describe in order, which is what makes this a
 * narrative rather than a set of independent checks: each step depends on the
 * state the previous one left behind.
 */

const ADMIN_EMAIL = 'owner@gym.test';
const ADMIN_PASSWORD = 'OwnerPass123';
const TRAINER_EMAIL = 'tina@gym.test';
const TRAINER_PASSWORD = 'TrainerPass1';
const MEMBER_EMAIL = 'mia@gym.test';
const MEMBER_PASSWORD = 'MemberPass1';

/** Everything the run accumulates, in the order it is produced. */
interface Run {
  adminToken: string;
  trainerToken: string;
  memberToken: string;
  categoryId: string;
  planId: string;
  annualPlanId: string;
  trainerId: string;
  memberId: string;
  membershipId: string;
  renewedMembershipId: string;
  firstPaymentId: string;
  workoutPlanId: string;
  workoutDayId: string;
  cardToken: string;
  attendanceId: string;
}

describe('ACCEPTANCE: the full business flow', () => {
  let ctx: TestContext;
  let server: App;
  const run = {} as Run;

  const auth = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];
  const admin = () => auth(run.adminToken);
  const trainer = () => auth(run.trainerToken);
  const member = () => auth(run.memberToken);

  const today = () => isoDaysFromToday(0);
  const monthStart = () => `${today().slice(0, 7)}-01`;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as App;
    await resetDatabase(ctx);

    // The only direct write in the run: the bootstrap administrator, which in
    // production comes from `npm run db:seed`. Everything after this point
    // goes through the API.
    const prisma = ctx.prisma as unknown as PrismaClient;
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: await hash(ADMIN_PASSWORD, 4),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Olivia',
        lastName: 'Owner',
      },
    });
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  // -------------------------------------------------------------------------
  // 1. Admin login
  // -------------------------------------------------------------------------

  it('1. the owner signs in', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    expect(res.body.user.role).toBe(UserRole.ADMIN);
    expect(res.body.tokenType).toBe('Bearer');
    expect(JSON.stringify(res.body)).not.toContain(ADMIN_PASSWORD);

    run.adminToken = res.body.accessToken as string;
  });

  // -------------------------------------------------------------------------
  // 2. Set the gym up
  // -------------------------------------------------------------------------

  it('2. the owner creates an expense category and two membership plans', async () => {
    const category = await request(server)
      .post('/api/v1/accounting/expense-categories')
      .set(...admin())
      .send({ name: 'Rent', description: 'Premises rent' })
      .expect(201);
    run.categoryId = category.body.id as string;

    const monthly = await request(server)
      .post('/api/v1/membership-plans')
      .set(...admin())
      .send({
        name: 'Monthly Unlimited',
        description: 'Unlimited visits for 30 days.',
        durationDays: 30,
        price: 49.99,
      })
      .expect(201);

    expect(monthly.body.price).toBe('49.99');
    expect(monthly.body.unlimitedVisits).toBe(true);
    run.planId = monthly.body.id as string;

    const annual = await request(server)
      .post('/api/v1/membership-plans')
      .set(...admin())
      .send({ name: 'Annual Unlimited', durationDays: 365, price: 449 })
      .expect(201);
    run.annualPlanId = annual.body.id as string;
  });

  // -------------------------------------------------------------------------
  // 3. Create a trainer
  // -------------------------------------------------------------------------

  it('3. the owner creates a trainer, account and profile together', async () => {
    const res = await request(server)
      .post('/api/v1/trainers')
      .set(...admin())
      .send({
        email: TRAINER_EMAIL,
        password: TRAINER_PASSWORD,
        firstName: 'Tina',
        lastName: 'Trainer',
        specialization: 'Strength & conditioning',
      })
      .expect(201);

    expect(res.body.trainerCode).toMatch(/^T-\d{6}$/);
    expect(res.body.account.email).toBe(TRAINER_EMAIL);
    expect(res.body.assignedMemberCount).toBe(0);
    run.trainerId = res.body.id as string;

    // The account really exists and can authenticate.
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: TRAINER_EMAIL, password: TRAINER_PASSWORD })
      .expect(200);
    expect(login.body.user.role).toBe(UserRole.TRAINER);
    run.trainerToken = login.body.accessToken as string;
  });

  // -------------------------------------------------------------------------
  // 4. Create a member
  // -------------------------------------------------------------------------

  it('4. the owner creates a member', async () => {
    const res = await request(server)
      .post('/api/v1/members')
      .set(...admin())
      .send({
        email: MEMBER_EMAIL,
        password: MEMBER_PASSWORD,
        firstName: 'Mia',
        lastName: 'Member',
        phone: '+15550100',
        dateOfBirth: '1995-04-17',
        notes: 'Prefers morning sessions',
      })
      .expect(201);

    expect(res.body.memberCode).toMatch(/^M-\d{6}$/);
    expect(res.body.assignedTrainer).toBeNull();
    run.memberId = res.body.id as string;
  });

  // -------------------------------------------------------------------------
  // 5. Sell a membership
  // -------------------------------------------------------------------------

  it('5. the owner sells the member a membership', async () => {
    const res = await request(server)
      .post('/api/v1/memberships')
      .set(...admin())
      .send({ memberId: run.memberId, planId: run.planId, startDate: today() })
      .expect(201);

    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.purchasePrice).toBe('49.99');
    expect(res.body.amountDue).toBe('49.99');
    expect(res.body.totalDays).toBe(30);
    expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(29));
    run.membershipId = res.body.id as string;

    // Nothing paid yet, so the member owes the full price.
    const billing = await request(server)
      .get(`/api/v1/billing/members/${run.memberId}`)
      .set(...admin())
      .expect(200);
    expect(billing.body.outstanding).toBe('49.99');
    expect(billing.body.memberships[0].settlementStatus).toBe('UNPAID');
  });

  // -------------------------------------------------------------------------
  // 6. Take payment — and the ledger entry must appear by itself
  // -------------------------------------------------------------------------

  it('6. the owner takes payment, and accounting income appears automatically', async () => {
    const before = await ctx.prisma.accountingEntry.count();
    expect(before).toBe(0);

    const res = await request(server)
      .post('/api/v1/payments')
      .set(...admin())
      .send({
        memberId: run.memberId,
        membershipId: run.membershipId,
        amount: 49.99,
        method: 'CARD',
        reference: 'AUTH-8821',
      })
      .expect(201);

    expect(res.body.amount).toBe('49.99');
    expect(res.body.status).toBe('COMPLETED');
    run.firstPaymentId = res.body.id as string;

    // The income entry was written by the payment, in the same transaction.
    const entries = await ctx.prisma.accountingEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        type: 'INCOME',
        incomeSource: 'MEMBERSHIP_PAYMENT',
        method: 'CARD',
        isAutomatic: true,
        paymentId: run.firstPaymentId,
      }),
    );
    expect(entries[0].amount.toFixed(2)).toBe('49.99');

    // ...and it cannot be posted twice, nor unpicked by hand.
    await expect(
      ctx.prisma.accountingEntry.create({
        data: {
          type: 'INCOME',
          amount: '49.99',
          occurredOn: new Date(`${today()}T00:00:00.000Z`),
          description: 'duplicate',
          paymentId: run.firstPaymentId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const voidAttempt = await request(server)
      .post(`/api/v1/accounting/entries/${entries[0].id}/void`)
      .set(...admin())
      .send({ reason: 'trying' })
      .expect(422);
    expect(voidAttempt.body.message).toMatch(/cannot be voided/);
  });

  it('6b. the membership is now settled', async () => {
    const res = await request(server)
      .get(`/api/v1/billing/members/${run.memberId}`)
      .set(...admin())
      .expect(200);

    expect(res.body.outstanding).toBe('0.00');
    expect(res.body.memberships[0].settlementStatus).toBe('PAID');
  });

  // -------------------------------------------------------------------------
  // 7. Assign the trainer
  // -------------------------------------------------------------------------

  it('7. the owner assigns the trainer to the member', async () => {
    const res = await request(server)
      .patch(`/api/v1/members/${run.memberId}/trainer`)
      .set(...admin())
      .send({ trainerId: run.trainerId })
      .expect(200);

    expect(res.body.assignedTrainer.id).toBe(run.trainerId);
    expect(res.body.assignedAt).not.toBeNull();

    // The trainer can now see them; before the assignment they could not.
    const roster = await request(server)
      .get('/api/v1/trainers/me/members')
      .set(...trainer())
      .expect(200);
    expect(roster.body.meta.total).toBe(1);
    expect(roster.body.data[0].id).toBe(run.memberId);
  });

  // -------------------------------------------------------------------------
  // 8. The trainer writes a programme
  // -------------------------------------------------------------------------

  it('8. the trainer writes a workout plan with a day and two exercises', async () => {
    const plan = await request(server)
      .post('/api/v1/workout-plans')
      .set(...trainer())
      .send({
        memberId: run.memberId,
        name: 'Autumn strength block',
        goal: 'First 100kg squat',
        trainerNotes: 'Four days a week, upper/lower split.',
      })
      .expect(201);

    expect(plan.body.trainerId).toBe(run.trainerId);
    run.workoutPlanId = plan.body.id as string;

    const withDay = await request(server)
      .post(`/api/v1/workout-plans/${run.workoutPlanId}/days`)
      .set(...trainer())
      .send({ dayOrder: 1, name: 'Push day' })
      .expect(201);
    run.workoutDayId = withDay.body.days[0].id as string;

    await request(server)
      .post(`/api/v1/workout-plans/${run.workoutPlanId}/days/${run.workoutDayId}/exercises`)
      .set(...trainer())
      .send({
        exerciseOrder: 1,
        name: 'Barbell bench press',
        targetMuscleGroup: 'Chest',
        sets: 4,
        reps: '8-12',
        weight: 80,
        restSeconds: 90,
      })
      .expect(201);

    const complete = await request(server)
      .post(`/api/v1/workout-plans/${run.workoutPlanId}/days/${run.workoutDayId}/exercises`)
      .set(...trainer())
      .send({ exerciseOrder: 2, name: 'Overhead press', sets: 3, reps: '6-8', weight: 45 })
      .expect(201);

    expect(complete.body.dayCount).toBe(1);
    expect(complete.body.exerciseCount).toBe(2);
  });

  it('8b. the trainer also records a baseline measurement', async () => {
    const res = await request(server)
      .post('/api/v1/measurements')
      .set(...trainer())
      .send({
        memberId: run.memberId,
        measuredOn: isoDaysFromToday(-30),
        weightKg: 90,
        heightCm: 180,
        bodyFatPercent: 24,
      })
      .expect(201);

    expect(res.body.weightKg).toBe('90.00');
  });

  // -------------------------------------------------------------------------
  // 9. The member signs in and sees only their own data
  // -------------------------------------------------------------------------

  it('9. the member signs in', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: MEMBER_EMAIL, password: MEMBER_PASSWORD })
      .expect(200);

    expect(res.body.user.role).toBe(UserRole.MEMBER);
    run.memberToken = res.body.accessToken as string;
  });

  it('10. the member sees their own data, and nothing else', async () => {
    const profile = await request(server)
      .get('/api/v1/members/me')
      .set(...member())
      .expect(200);
    expect(profile.body.id).toBe(run.memberId);
    expect(profile.body.assignedTrainer.firstName).toBe('Tina');
    // Staff notes are about the member, not for them.
    expect(profile.body).not.toHaveProperty('notes');

    const membership = await request(server)
      .get('/api/v1/memberships/me')
      .set(...member())
      .expect(200);
    expect(membership.body.current.id).toBe(run.membershipId);

    const plan = await request(server)
      .get(`/api/v1/workout-plans/${run.workoutPlanId}`)
      .set(...member())
      .expect(200);
    // The coaching notes are meant to be read by the member.
    expect(plan.body.trainerNotes).toContain('Four days a week');
    expect(plan.body.days[0].exercises).toHaveLength(2);

    // Everything staff-only is refused.
    for (const path of [
      '/api/v1/members',
      '/api/v1/payments',
      '/api/v1/reports/revenue?from=2026-01-01&to=2026-12-31',
      '/api/v1/accounting/entries',
      '/api/v1/audit/logs',
      '/api/v1/dashboard/admin',
    ]) {
      const res = await request(server)
        .get(path)
        .set(...member());
      expect(res.status).toBe(403);
    }
  });

  it('10b. a second member cannot see the first member anywhere', async () => {
    const other = await request(server)
      .post('/api/v1/members')
      .set(...admin())
      .send({
        email: 'nosy@gym.test',
        password: 'MemberPass1',
        firstName: 'Nora',
        lastName: 'Nosy',
      })
      .expect(201);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'nosy@gym.test', password: 'MemberPass1' })
      .expect(200);
    const nosy = auth(login.body.accessToken as string);

    for (const path of [
      `/api/v1/memberships/${run.membershipId}`,
      `/api/v1/payments/${run.firstPaymentId}`,
      `/api/v1/workout-plans/${run.workoutPlanId}`,
    ]) {
      const res = await request(server)
        .get(path)
        .set(...nosy);
      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain(MEMBER_EMAIL);
    }

    // Their own views are empty, not somebody else's.
    const ownPlans = await request(server)
      .get('/api/v1/workout-plans/me')
      .set(...nosy)
      .expect(200);
    expect(ownPlans.body.meta.total).toBe(0);

    void other;
  });

  // -------------------------------------------------------------------------
  // 11. QR check-in
  // -------------------------------------------------------------------------

  it('11. the member fetches their QR card and is checked in by scanning it', async () => {
    const card = await request(server)
      .get('/api/v1/membership-cards/me')
      .set(...member())
      .expect(200);

    expect(card.body.active).toBe(true);
    expect(card.body.token.split('.')).toHaveLength(4);
    run.cardToken = card.body.token as string;

    const checkIn = await request(server)
      .post('/api/v1/attendance/check-in/qr')
      .set(...admin())
      .send({ token: run.cardToken })
      .expect(201);

    expect(checkIn.body.admitted).toBe(true);
    expect(checkIn.body.attendance.method).toBe('QR');
    expect(checkIn.body.attendance.stillInside).toBe(true);
    // An unlimited membership deducts nothing.
    expect(checkIn.body.attendance.visitDeducted).toBe(false);
    expect(checkIn.body.visitsRemaining).toBeNull();
    run.attendanceId = checkIn.body.attendance.id as string;
  });

  it('11b. attendance is recorded, and a second scan is refused', async () => {
    const todayView = await request(server)
      .get('/api/v1/attendance/today')
      .set(...admin())
      .expect(200);

    expect(todayView.body.totalVisits).toBe(1);
    expect(todayView.body.currentlyInside).toBe(1);

    const again = await request(server)
      .post('/api/v1/attendance/check-in/qr')
      .set(...admin())
      .send({ token: run.cardToken })
      .expect(422);
    expect(again.body.details[0].messages[0]).toBe('ALREADY_INSIDE');

    const out = await request(server)
      .post('/api/v1/attendance/check-out/qr')
      .set(...admin())
      .send({ token: run.cardToken })
      .expect(200);
    expect(out.body.stillInside).toBe(false);

    const history = await request(server)
      .get('/api/v1/attendance/me')
      .set(...member())
      .expect(200);
    expect(history.body.meta.total).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 12. An expense, and the accounting that follows
  // -------------------------------------------------------------------------

  it('12. the owner records an expense', async () => {
    const res = await request(server)
      .post('/api/v1/accounting/entries')
      .set(...admin())
      .send({
        type: 'EXPENSE',
        amount: 1200,
        occurredOn: today(),
        description: 'October rent',
        expenseCategoryId: run.categoryId,
        method: 'TRANSFER',
      })
      .expect(201);

    expect(res.body.amount).toBe('1200.00');
    expect(res.body.isAutomatic).toBe(false);
  });

  it('13. the accounts reconcile', async () => {
    const res = await request(server)
      .get('/api/v1/accounting/summary')
      .query({ from: monthStart(), to: today() })
      .set(...admin())
      .expect(200);

    expect(res.body.income).toBe('49.99');
    expect(res.body.refunds).toBe('0.00');
    expect(res.body.revenue).toBe('49.99');
    expect(res.body.expenses).toBe('1200.00');
    expect(res.body.profit).toBe('-1150.01');

    expect(res.body.expensesByCategory[0]).toEqual(
      expect.objectContaining({ expenseCategoryName: 'Rent', amount: '1200.00' }),
    );
    const card = (res.body.byPaymentMethod as Array<{ method: string; income: string }>).find(
      (row) => row.method === 'CARD',
    );
    expect(card?.income).toBe('49.99');
  });

  // -------------------------------------------------------------------------
  // 14. Freeze and unfreeze
  // -------------------------------------------------------------------------

  it('14. the owner freezes the membership, and the member cannot get in', async () => {
    const res = await request(server)
      .post(`/api/v1/memberships/${run.membershipId}/freeze`)
      .set(...admin())
      .send({ reason: 'Travelling for two weeks' })
      .expect(200);

    expect(res.body.status).toBe('FROZEN');
    expect(res.body.daysRemaining).toBeNull();
    expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(29));

    const refused = await request(server)
      .post('/api/v1/attendance/check-in/qr')
      .set(...admin())
      .send({ token: run.cardToken })
      .expect(422);
    expect(refused.body.details[0].messages[0]).toBe('MEMBERSHIP_FROZEN');

    // The member's own dashboard agrees with the door.
    const dashboard = await request(server)
      .get('/api/v1/dashboard/member')
      .set(...member())
      .expect(200);
    expect(dashboard.body.membershipStatus).toBe('FROZEN');
    expect(dashboard.body.canCheckInNow).toBe(false);
  });

  it('15. the owner unfreezes it, and the paused days are credited back', async () => {
    // The only simulation of elapsed time in the run: the freeze began a
    // fortnight ago. Nothing about the business rule is bypassed.
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);
    await ctx.prisma.memberMembership.update({
      where: { id: run.membershipId },
      data: { frozenAt: fourteenDaysAgo },
    });
    await ctx.prisma.membershipFreeze.updateMany({
      where: { membershipId: run.membershipId, endedAt: null },
      data: { startedAt: fourteenDaysAgo },
    });

    const res = await request(server)
      .post(`/api/v1/memberships/${run.membershipId}/unfreeze`)
      .set(...admin())
      .expect(200);

    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.totalFrozenDays).toBe(14);
    // 29 days out, plus the 14 that were paused.
    expect(res.body.endDate.slice(0, 10)).toBe(isoDaysFromToday(43));
    expect(res.body.freezes[0].days).toBe(14);

    // And the door opens again.
    await request(server)
      .post('/api/v1/attendance/check-in/qr')
      .set(...admin())
      .send({ token: run.cardToken })
      .expect(201);
    await request(server)
      .post('/api/v1/attendance/check-out/qr')
      .set(...admin())
      .send({ token: run.cardToken })
      .expect(200);
  });

  // -------------------------------------------------------------------------
  // 16. Renew, and take the second payment
  // -------------------------------------------------------------------------

  it('16. the owner renews the membership onto the annual plan', async () => {
    const res = await request(server)
      .post(`/api/v1/memberships/${run.membershipId}/renew`)
      .set(...admin())
      .send({ planId: run.annualPlanId })
      .expect(201);

    expect(res.body.previousMembershipId).toBe(run.membershipId);
    expect(res.body.plan.name).toBe('Annual Unlimited');
    expect(res.body.purchasePrice).toBe('449.00');
    expect(res.body.status).toBe('PENDING');
    // Starts the day after the extended term ends.
    expect(res.body.startDate.slice(0, 10)).toBe(isoDaysFromToday(44));
    run.renewedMembershipId = res.body.id as string;

    // The original term keeps what was paid for it.
    const original = await request(server)
      .get(`/api/v1/memberships/${run.membershipId}`)
      .set(...admin())
      .expect(200);
    expect(original.body.purchasePrice).toBe('49.99');
  });

  it('17. the owner takes the second payment, with a discount applied first', async () => {
    const discounted = await request(server)
      .post(`/api/v1/memberships/${run.renewedMembershipId}/discount`)
      .set(...admin())
      .send({ amount: 49, reason: 'Loyalty discount' })
      .expect(200);

    expect(discounted.body.purchasePrice).toBe('449.00');
    expect(discounted.body.discountAmount).toBe('49.00');
    expect(discounted.body.amountDue).toBe('400.00');

    await request(server)
      .post('/api/v1/payments')
      .set(...admin())
      .send({
        memberId: run.memberId,
        membershipId: run.renewedMembershipId,
        amount: 400,
        method: 'TRANSFER',
      })
      .expect(201);

    const billing = await request(server)
      .get(`/api/v1/billing/members/${run.memberId}`)
      .set(...admin())
      .expect(200);

    expect(billing.body.amountDue).toBe('449.99');
    expect(billing.body.netPaid).toBe('449.99');
    expect(billing.body.outstanding).toBe('0.00');

    // Two payments, two automatic income entries, no more and no fewer.
    const income = await ctx.prisma.accountingEntry.count({
      where: { type: 'INCOME', isAutomatic: true },
    });
    expect(income).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 18. The dashboards
  // -------------------------------------------------------------------------

  it('18. the admin dashboard reflects the whole run', async () => {
    const res = await request(server)
      .get('/api/v1/dashboard/admin')
      .set(...admin())
      .expect(200);

    expect(res.body.activeMembers).toBe(1);
    expect(res.body.totalMembers).toBe(2);
    expect(res.body.membersWithoutMembership).toBe(1);
    expect(res.body.todayCheckIns).toBe(2);
    expect(res.body.currentlyInside).toBe(0);
    expect(res.body.activeTrainers).toBe(1);
    expect(res.body.newMembersThisMonth).toBe(2);
    expect(res.body.membershipsSoldThisMonth).toBe(2);

    expect(res.body.monthlyRevenue).toBe('449.99');
    expect(res.body.monthlyExpenses).toBe('1200.00');
    expect(res.body.monthlyProfit).toBe('-750.01');
    expect(res.body.totalOutstanding).toBe('0.00');
    expect(res.body.membersInDebt).toBe(0);
  });

  it('19. the trainer dashboard shows their member and their work', async () => {
    const res = await request(server)
      .get('/api/v1/dashboard/trainer')
      .set(...trainer())
      .expect(200);

    expect(res.body.trainerId).toBe(run.trainerId);
    expect(res.body.assignedMembers).toBe(1);
    expect(res.body.assignedMembersActive).toBe(1);
    expect(res.body.activeWorkoutPlans).toBe(1);

    expect(res.body.memberActivity).toHaveLength(1);
    expect(res.body.memberActivity[0]).toEqual(
      expect.objectContaining({
        memberId: run.memberId,
        visitsThisMonth: 2,
        daysSinceLastVisit: 0,
        needsAttention: false,
        membershipStatus: 'ACTIVE',
      }),
    );
  });

  it('20. the member dashboard shows everything they should see', async () => {
    const res = await request(server)
      .get('/api/v1/dashboard/member')
      .set(...member())
      .expect(200);

    expect(res.body.memberId).toBe(run.memberId);
    expect(res.body.membershipStatus).toBe('ACTIVE');
    expect(res.body.membershipPlanName).toBe('Monthly Unlimited');
    expect(res.body.daysRemaining).toBe(44);
    expect(res.body.unlimitedVisits).toBe(true);
    expect(res.body.visitsRemaining).toBeNull();
    expect(res.body.canCheckInNow).toBe(true);
    expect(res.body.assignedTrainer.name).toBe('Tina Trainer');
    expect(res.body.visitsThisMonth).toBe(2);
    expect(res.body.visitsAllTime).toBe(2);
    expect(res.body.workoutPlanName).toBe('Autumn strength block');
    expect(res.body.workoutPlanDays).toBe(1);
    expect(res.body.outstandingBalance).toBe('0.00');
  });

  // -------------------------------------------------------------------------
  // 19. The reports
  // -------------------------------------------------------------------------

  it('21. the reports reconcile with the records they summarise', async () => {
    const period = { from: monthStart(), to: today() };

    const sales = await request(server)
      .get('/api/v1/reports/membership-sales')
      .query(period)
      .set(...admin())
      .expect(200);
    expect(sales.body.totalSold).toBe(2);
    expect(sales.body.grossValue).toBe('498.99');
    expect(sales.body.discounts).toBe('49.00');
    expect(sales.body.netValue).toBe('449.99');
    expect(sales.body.renewals).toBe(1);
    expect(sales.body.firstTimeSales).toBe(1);

    const revenue = await request(server)
      .get('/api/v1/reports/revenue')
      .query(period)
      .set(...admin())
      .expect(200);
    expect(revenue.body.revenue).toBe('449.99');

    const expenses = await request(server)
      .get('/api/v1/reports/expenses')
      .query(period)
      .set(...admin())
      .expect(200);
    expect(expenses.body.expenses).toBe('1200.00');
    expect(expenses.body.byCategory[0].share).toBe(100);

    const profit = await request(server)
      .get('/api/v1/reports/profit')
      .query(period)
      .set(...admin())
      .expect(200);
    expect(profit.body.profit).toBe('-750.01');

    const attendance = await request(server)
      .get('/api/v1/reports/attendance')
      .query(period)
      .set(...admin())
      .expect(200);
    expect(attendance.body.totalVisits).toBe(2);
    expect(attendance.body.uniqueMembers).toBe(1);
    expect(attendance.body.byMethod).toEqual({ MANUAL: 0, QR: 2 });

    const renewals = await request(server)
      .get('/api/v1/reports/renewals')
      .query(period)
      .set(...admin())
      .expect(200);
    expect(renewals.body.totalRenewals).toBe(1);
    expect(renewals.body.planChanges).toBe(1);

    const unpaid = await request(server)
      .get('/api/v1/reports/unpaid-balances')
      .set(...admin())
      .expect(200);
    expect(unpaid.body.membersInDebt).toBe(0);
    expect(unpaid.body.totalOutstanding).toBe('0.00');

    const trainers = await request(server)
      .get('/api/v1/reports/trainer-stats')
      .query(period)
      .set(...admin())
      .expect(200);
    expect(trainers.body.trainers).toBe(1);
    expect(trainers.body.stats[0]).toEqual(
      expect.objectContaining({
        trainerId: run.trainerId,
        assignedMembers: 1,
        plansWritten: 1,
      }),
    );
  });

  it('22. every report agrees with the ledger and the billing service', async () => {
    const period = { from: monthStart(), to: today() };

    const [revenue, profit, summary, unpaid, dashboard] = await Promise.all([
      request(server)
        .get('/api/v1/reports/revenue')
        .query(period)
        .set(...admin())
        .expect(200),
      request(server)
        .get('/api/v1/reports/profit')
        .query(period)
        .set(...admin())
        .expect(200),
      request(server)
        .get('/api/v1/accounting/summary')
        .query(period)
        .set(...admin())
        .expect(200),
      request(server)
        .get('/api/v1/reports/unpaid-balances')
        .set(...admin())
        .expect(200),
      request(server)
        .get('/api/v1/dashboard/admin')
        .set(...admin())
        .expect(200),
    ]);

    // Four different endpoints, one set of numbers.
    expect(revenue.body.revenue).toBe(summary.body.revenue);
    expect(profit.body.profit).toBe(summary.body.profit);
    expect(dashboard.body.monthlyRevenue).toBe(summary.body.revenue);
    expect(dashboard.body.monthlyProfit).toBe(summary.body.profit);
    expect(dashboard.body.totalOutstanding).toBe(unpaid.body.totalOutstanding);
  });

  // -------------------------------------------------------------------------
  // 20. The audit trail covers the whole run
  // -------------------------------------------------------------------------

  it('23. every action in the run is on the audit trail, with no credentials in it', async () => {
    const res = await request(server)
      .get('/api/v1/audit/logs')
      .query({ limit: 100 })
      .set(...admin())
      .expect(200);

    const actions = (res.body.data as Array<{ action: string }>).map((log) => log.action);

    for (const expected of [
      'auth.login',
      'trainers.create',
      'members.create',
      'memberships.create',
      'payments.create',
      'members.assignTrainer',
      'workoutPlans.create',
      'attendance.checkInByQr',
      'accounting.createEntry',
      'memberships.freeze',
      'memberships.unfreeze',
      'memberships.renew',
    ]) {
      expect(actions).toContain(expected);
    }

    const serialized = JSON.stringify(res.body);
    for (const secret of [ADMIN_PASSWORD, TRAINER_PASSWORD, MEMBER_PASSWORD, run.cardToken]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('[REDACTED]');
  });

  it('24. the reminder sweep is clean, because nobody owes anything', async () => {
    const res = await request(server)
      .post('/api/v1/notifications/run-reminders')
      .set(...admin())
      .send({ expiringWithinDays: 7 })
      .expect(200);

    expect(res.body.paymentReminders).toBe(0);
    expect(res.body.expiringMemberships).toBe(0);
  });

  it('25. nothing in the run left the database in an invalid state', async () => {
    // Invariants the schema enforces, re-checked against the data the run built.
    const [memberships, payments, entries, attendances] = await Promise.all([
      ctx.prisma.memberMembership.findMany(),
      ctx.prisma.payment.findMany({ include: { refunds: true } }),
      ctx.prisma.accountingEntry.findMany(),
      ctx.prisma.attendance.findMany(),
    ]);

    for (const membership of memberships) {
      expect(membership.endDate >= membership.startDate).toBe(true);
      expect(membership.discountAmount.lessThanOrEqualTo(membership.purchasePrice)).toBe(true);
      expect(membership.visitsUsed).toBeGreaterThanOrEqual(0);
    }

    for (const payment of payments) {
      expect(payment.amount.greaterThan(0)).toBe(true);
    }

    for (const entry of entries) {
      expect(entry.amount.greaterThan(0)).toBe(true);
      // An expense is always categorised; income never is.
      expect(
        entry.type === 'EXPENSE'
          ? entry.expenseCategoryId !== null
          : entry.expenseCategoryId === null,
      ).toBe(true);
    }

    for (const attendance of attendances) {
      if (attendance.checkedOutAt) {
        expect(attendance.checkedOutAt >= attendance.checkedInAt).toBe(true);
      }
    }

    // Exactly one automatic ledger entry per payment.
    const automatic = entries.filter((entry) => entry.isAutomatic);
    expect(new Set(automatic.map((entry) => entry.paymentId)).size).toBe(automatic.length);
  });
});
