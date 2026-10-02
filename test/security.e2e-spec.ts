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
 * The security sweep.
 *
 * Phases 3 to 8 each tested their own scoping. This suite exists to check the
 * property across the whole surface at once: for every resource belonging to one
 * member, no other member, no unrelated trainer, and no anonymous caller can
 * read or change it — and the refusal never reveals that the record exists.
 */
describe('Security: cross-tenant access and database invariants (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;

  /** Everything belonging to one member, for an attacker to aim at. */
  interface Victim {
    member: Awaited<ReturnType<typeof seedMemberProfile>>;
    membershipId: string;
    paymentId: string;
    attendanceId: string;
    measurementId: string;
    planId: string;
    sessionId: string;
    notificationId: string;
  }

  let victim: Victim;
  let attackerMember: Awaited<ReturnType<typeof seedMemberProfile>>;
  let unrelatedTrainer: Awaited<ReturnType<typeof seedTrainerProfile>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const asAdmin = () => bearer(admin.accessToken);

  beforeEach(async () => {
    await resetDatabase(ctx);
    admin = await seedAndLogin(ctx, server, { role: UserRole.ADMIN });

    const plan = await seedPlan(ctx, { name: 'Monthly', price: '49.99' });
    const victimTrainer = await seedTrainerProfile(ctx, server, { email: 'victims@gym.test' });
    const member = await seedMemberProfile(ctx, server, {
      email: 'victim@gym.test',
      assignedTrainerId: victimTrainer.trainerId,
    });

    const membership = await seedMembership(ctx, member.memberId, plan.id, {
      purchasePrice: '49.99',
    });

    const payment = await request(server)
      .post('/api/v1/payments')
      .set(...asAdmin())
      .send({
        memberId: member.memberId,
        membershipId: membership.id,
        amount: 20,
        method: 'CASH',
      })
      .expect(201);

    const attendance = await request(server)
      .post('/api/v1/attendance/check-in')
      .set(...asAdmin())
      .send({ memberId: member.memberId })
      .expect(201);

    const measurement = await request(server)
      .post('/api/v1/measurements')
      .set(...asAdmin())
      .send({ memberId: member.memberId, measuredOn: isoDaysFromToday(0), weightKg: 80 })
      .expect(201);

    const workoutPlan = await request(server)
      .post('/api/v1/workout-plans')
      .set(...asAdmin())
      .send({ memberId: member.memberId, name: 'Private programme' })
      .expect(201);

    const session = await request(server)
      .post('/api/v1/training-sessions')
      .set(...asAdmin())
      .send({
        memberId: member.memberId,
        trainerId: victimTrainer.trainerId,
        startsAt: `${isoDaysFromToday(3)}T09:00:00.000Z`,
        endsAt: `${isoDaysFromToday(3)}T10:00:00.000Z`,
      })
      .expect(201);

    await request(server)
      .post('/api/v1/notifications/announcements')
      .set(...asAdmin())
      .send({ title: 'Private notice', body: 'For one member only.', userIds: [member.user.id] })
      .expect(201);
    const notification = await ctx.prisma.notification.findFirstOrThrow({
      where: { recipientId: member.user.id },
    });

    victim = {
      member,
      membershipId: membership.id,
      paymentId: payment.body.id as string,
      attendanceId: attendance.body.attendance.id as string,
      measurementId: measurement.body.id as string,
      planId: workoutPlan.body.id as string,
      sessionId: session.body.id as string,
      notificationId: notification.id,
    };

    attackerMember = await seedMemberProfile(ctx, server, { email: 'attacker@gym.test' });
    unrelatedTrainer = await seedTrainerProfile(ctx, server, { email: 'nosy@gym.test' });
  });

  type NamedPath = [label: string, path: () => string];

  /** Every scoped read, with the resource a victim owns. */
  const scopedReads = (): NamedPath[] => [
    ['membership', () => `/api/v1/memberships/${victim.membershipId}`],
    ['payment', () => `/api/v1/payments/${victim.paymentId}`],
    ['attendance', () => `/api/v1/attendance/${victim.attendanceId}`],
    ['measurement', () => `/api/v1/measurements/${victim.measurementId}`],
    ['workout plan', () => `/api/v1/workout-plans/${victim.planId}`],
    ['training session', () => `/api/v1/training-sessions/${victim.sessionId}`],
  ];

  describe('another member cannot read anything of the victim', () => {
    it.each(scopedReads())('is refused the %s', async (_label, path) => {
      const res = await request(server)
        .get(path())
        .set(...bearer(attackerMember.accessToken));

      // 404 or 403, but never 200 — and never the record.
      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain('victim@gym.test');
    });

    it('is refused the notification', async () => {
      await request(server)
        .post(`/api/v1/notifications/${victim.notificationId}/read`)
        .set(...bearer(attackerMember.accessToken))
        .expect(404);
    });

    it('cannot find the victim through any list endpoint', async () => {
      for (const path of [
        '/api/v1/memberships/me',
        '/api/v1/payments/me',
        '/api/v1/attendance/me',
        '/api/v1/measurements/me',
        '/api/v1/workout-plans/me',
        '/api/v1/notifications',
      ]) {
        const res = await request(server)
          .get(path)
          .set(...bearer(attackerMember.accessToken))
          .expect(200);

        expect(JSON.stringify(res.body)).not.toContain('victim@gym.test');
        expect(JSON.stringify(res.body)).not.toContain(victim.member.memberId);
      }
    });
  });

  describe('an unrelated trainer cannot reach the victim', () => {
    it.each(scopedReads())('is refused the %s', async (_label, path) => {
      const res = await request(server)
        .get(path())
        .set(...bearer(unrelatedTrainer.accessToken));

      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain('victim@gym.test');
    });

    it('cannot write to the victim either', async () => {
      const attempts = [
        request(server)
          .post('/api/v1/measurements')
          .set(...bearer(unrelatedTrainer.accessToken))
          .send({
            memberId: victim.member.memberId,
            measuredOn: isoDaysFromToday(1),
            weightKg: 70,
          }),
        request(server)
          .post('/api/v1/workout-plans')
          .set(...bearer(unrelatedTrainer.accessToken))
          .send({ memberId: victim.member.memberId, name: 'Hijack' }),
        request(server)
          .patch(`/api/v1/workout-plans/${victim.planId}`)
          .set(...bearer(unrelatedTrainer.accessToken))
          .send({ name: 'Hijacked' }),
        request(server)
          .post(`/api/v1/training-sessions/${victim.sessionId}/cancel`)
          .set(...bearer(unrelatedTrainer.accessToken))
          .send({}),
      ];

      for (const attempt of attempts) {
        const res = await attempt;
        expect([403, 404]).toContain(res.status);
      }

      // Nothing changed.
      const plan = await ctx.prisma.workoutPlan.findUniqueOrThrow({
        where: { id: victim.planId },
      });
      expect(plan.name).toBe('Private programme');
      expect(await ctx.prisma.memberMeasurement.count()).toBe(1);
    });

    it('sees the victim in no list', async () => {
      for (const path of [
        '/api/v1/members',
        '/api/v1/memberships',
        '/api/v1/attendance',
        '/api/v1/measurements',
        '/api/v1/workout-plans',
        '/api/v1/training-sessions',
      ]) {
        const res = await request(server)
          .get(path)
          .set(...bearer(unrelatedTrainer.accessToken))
          .expect(200);

        expect(res.body.meta.total).toBe(0);
      }
    });
  });

  describe('a refusal reveals nothing about what exists', () => {
    it.each(scopedReads())(
      'answers identically for a real %s and an invented id',
      async (_label, path) => {
        const real = await request(server)
          .get(path())
          .set(...bearer(attackerMember.accessToken));

        const invented = await request(server)
          .get(path().replace(/[0-9a-f-]{36}$/i, '0b5f8a2e-0000-4000-8000-000000000000'))
          .set(...bearer(attackerMember.accessToken));

        expect(real.status).toBe(invented.status);
        expect(real.body.error).toBe(invented.body.error);
      },
    );
  });

  describe('anonymous callers reach nothing', () => {
    const anonymousTargets = (): NamedPath[] => [
      ...scopedReads(),
      ['member dashboard', () => '/api/v1/dashboard/member'],
      ['admin dashboard', () => '/api/v1/dashboard/admin'],
      ['notifications', () => '/api/v1/notifications'],
      ['audit log', () => '/api/v1/audit/logs'],
      ['revenue report', () => '/api/v1/reports/revenue?from=2026-10-01&to=2026-10-31'],
    ];

    it.each(anonymousTargets())('is refused the %s', async (_label, path) => {
      await request(server).get(path()).expect(401);
    });

    it('cannot write anything', async () => {
      for (const attempt of [
        request(server).post('/api/v1/members').send({}),
        request(server).post('/api/v1/payments').send({}),
        request(server).post('/api/v1/attendance/check-in').send({}),
        request(server).post('/api/v1/notifications/announcements').send({}),
      ]) {
        const res = await attempt;
        expect(res.status).toBe(401);
      }
    });
  });

  describe('a deactivated account loses access immediately', () => {
    it('cannot use a token issued before deactivation', async () => {
      await request(server)
        .get('/api/v1/notifications')
        .set(...bearer(attackerMember.accessToken))
        .expect(200);

      await request(server)
        .patch(`/api/v1/users/${attackerMember.user.id}/status`)
        .set(...asAdmin())
        .send({ status: 'INACTIVE' })
        .expect(200);

      await request(server)
        .get('/api/v1/notifications')
        .set(...bearer(attackerMember.accessToken))
        .expect(403);
    });
  });

  describe('the database refuses what the application refuses', () => {
    it('rejects an overlapping membership inserted directly', async () => {
      const plan = await ctx.prisma.membershipPlan.findFirstOrThrow();

      await expect(
        ctx.prisma.memberMembership.create({
          data: {
            memberId: victim.member.memberId,
            planId: plan.id,
            purchasePrice: '10.00',
            startDate: new Date(`${isoDaysFromToday(1)}T00:00:00.000Z`),
            endDate: new Date(`${isoDaysFromToday(2)}T00:00:00.000Z`),
          },
        }),
      ).rejects.toThrow(/exclusion constraint/i);
    });

    it('allows a non-overlapping membership', async () => {
      const plan = await ctx.prisma.membershipPlan.findFirstOrThrow();

      await expect(
        ctx.prisma.memberMembership.create({
          data: {
            memberId: victim.member.memberId,
            planId: plan.id,
            purchasePrice: '10.00',
            startDate: new Date(`${isoDaysFromToday(60)}T00:00:00.000Z`),
            endDate: new Date(`${isoDaysFromToday(70)}T00:00:00.000Z`),
          },
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a second open visit for the same member', async () => {
      await expect(
        ctx.prisma.attendance.create({
          data: { memberId: victim.member.memberId, method: 'MANUAL' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('rejects an overlapping session for the same trainer', async () => {
      const session = await ctx.prisma.trainingSession.findFirstOrThrow();
      const other = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });

      await expect(
        ctx.prisma.trainingSession.create({
          data: {
            trainerId: session.trainerId,
            memberId: other.memberId,
            startsAt: new Date(`${isoDaysFromToday(3)}T09:30:00.000Z`),
            endsAt: new Date(`${isoDaysFromToday(3)}T10:30:00.000Z`),
          },
        }),
      ).rejects.toThrow(/exclusion constraint/i);
    });

    it('allows a back-to-back session', async () => {
      const session = await ctx.prisma.trainingSession.findFirstOrThrow();
      const other = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });

      await expect(
        ctx.prisma.trainingSession.create({
          data: {
            trainerId: session.trainerId,
            memberId: other.memberId,
            startsAt: new Date(`${isoDaysFromToday(3)}T10:00:00.000Z`),
            endsAt: new Date(`${isoDaysFromToday(3)}T11:00:00.000Z`),
          },
        }),
      ).resolves.toBeDefined();
    });

    it.each([
      [
        'a negative payment',
        () =>
          ctx.prisma.payment.create({
            data: {
              memberId: victim.member.memberId,
              amount: '-5.00',
              method: 'CASH',
              paidAt: new Date(),
            },
          }),
      ],
      [
        'a zero payment',
        () =>
          ctx.prisma.payment.create({
            data: {
              memberId: victim.member.memberId,
              amount: '0.00',
              method: 'CASH',
              paidAt: new Date(),
            },
          }),
      ],
      [
        'a discount above the price',
        () =>
          ctx.prisma.memberMembership.update({
            where: { id: victim.membershipId },
            data: { discountAmount: '9999.00' },
          }),
      ],
      [
        'an end date before the start',
        () =>
          ctx.prisma.memberMembership.update({
            where: { id: victim.membershipId },
            data: { endDate: new Date(`${isoDaysFromToday(-60)}T00:00:00.000Z`) },
          }),
      ],
      [
        'negative visits used',
        () =>
          ctx.prisma.memberMembership.update({
            where: { id: victim.membershipId },
            data: { visitsUsed: -1 },
          }),
      ],
      [
        'a checkout before the check-in',
        () =>
          ctx.prisma.attendance.update({
            where: { id: victim.attendanceId },
            data: { checkedOutAt: new Date(`${isoDaysFromToday(-5)}T00:00:00.000Z`) },
          }),
      ],
      [
        'zero sets on an exercise',
        async () => {
          const day = await ctx.prisma.workoutDay.create({
            data: { planId: victim.planId, dayOrder: 1, name: 'Push' },
          });
          return ctx.prisma.workoutExercise.create({
            data: { dayId: day.id, exerciseOrder: 1, name: 'Bench', sets: 0, reps: '8' },
          });
        },
      ],
    ])('rejects %s', async (_label, attempt) => {
      await expect(attempt()).rejects.toThrow(/check constraint/i);
    });

    it('rejects income filed under an expense category', async () => {
      const category = await ctx.prisma.expenseCategory.create({ data: { name: 'Rent' } });

      await expect(
        ctx.prisma.accountingEntry.create({
          data: {
            type: 'INCOME',
            amount: '10.00',
            occurredOn: new Date(`${isoDaysFromToday(0)}T00:00:00.000Z`),
            description: 'Misfiled',
            expenseCategoryId: category.id,
          },
        }),
      ).rejects.toThrow(/check constraint/i);
    });

    it('rejects an expense with no category', async () => {
      await expect(
        ctx.prisma.accountingEntry.create({
          data: {
            type: 'EXPENSE',
            amount: '10.00',
            occurredOn: new Date(`${isoDaysFromToday(0)}T00:00:00.000Z`),
            description: 'Uncategorised',
          },
        }),
      ).rejects.toThrow(/check constraint/i);
    });

    it('rejects a duplicate reminder, which is what makes the sweep idempotent', async () => {
      await ctx.prisma.notification.create({
        data: {
          recipientId: victim.member.user.id,
          type: 'PAYMENT_DUE',
          title: 'x',
          body: 'y',
          dedupeKey: 'unique-key',
        },
      });

      await expect(
        ctx.prisma.notification.create({
          data: {
            recipientId: victim.member.user.id,
            type: 'PAYMENT_DUE',
            title: 'x',
            body: 'y',
            dedupeKey: 'unique-key',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('rejects a second ledger entry for one payment', async () => {
      await expect(
        ctx.prisma.accountingEntry.create({
          data: {
            type: 'INCOME',
            amount: '20.00',
            occurredOn: new Date(`${isoDaysFromToday(0)}T00:00:00.000Z`),
            description: 'Double post',
            paymentId: victim.paymentId,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('every refusal is on the record', () => {
    it('records a cross-tenant attempt in the audit trail', async () => {
      await request(server)
        .patch(`/api/v1/workout-plans/${victim.planId}`)
        .set(...bearer(unrelatedTrainer.accessToken))
        .send({ name: 'Hijacked' });

      const res = await request(server)
        .get('/api/v1/audit/logs')
        .query({ outcome: 'FAILURE' })
        .set(...asAdmin())
        .expect(200);

      const attempt = (
        res.body.data as Array<{
          action: string;
          actorEmail: string | null;
          entityId: string | null;
        }>
      ).find((log) => log.action.startsWith('workoutPlans.'));

      expect(attempt).toBeDefined();
      expect(attempt?.actorEmail).toBe('nosy@gym.test');
      expect(attempt?.entityId).toBe(victim.planId);
    });
  });
});
