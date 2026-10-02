import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import {
  bearer,
  seedAndLogin,
  seedMemberProfile,
  seedTrainerProfile,
  type SignedInUser,
} from './utils/auth';

describe('Member progress and body measurements (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;
  let trainer: Awaited<ReturnType<typeof seedTrainerProfile>>;
  let assigned: Awaited<ReturnType<typeof seedMemberProfile>>;
  let unassigned: Awaited<ReturnType<typeof seedMemberProfile>>;

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
    assigned = await seedMemberProfile(ctx, server, {
      email: 'mine@gym.test',
      assignedTrainerId: trainer.trainerId,
    });
    unassigned = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });
  });

  const asTrainer = () => bearer(trainer.accessToken);
  const asAdmin = () => bearer(admin.accessToken);

  const record = (body: Record<string, unknown>) =>
    request(server)
      .post('/api/v1/measurements')
      .set(...asTrainer())
      .send({ memberId: assigned.memberId, ...body });

  describe('recording', () => {
    it('stores a full set of measurements with exact decimals', async () => {
      const res = await record({
        measuredOn: '2026-07-01',
        weightKg: 90.5,
        heightCm: 180,
        bodyFatPercent: 24.3,
        muscleMassKg: 35.75,
        chestCm: 102.5,
        waistCm: 100,
        hipsCm: 98,
        thighCm: 58,
        armCm: 34,
        restingHeartRate: 62,
        notes: 'Baseline',
      }).expect(201);

      expect(res.body.weightKg).toBe('90.50');
      expect(res.body.heightCm).toBe('180.0');
      expect(res.body.bodyFatPercent).toBe('24.3');
      expect(res.body.muscleMassKg).toBe('35.75');
      expect(res.body.restingHeartRate).toBe(62);
      expect(res.body.memberCode).toMatch(/^M-\d{6}$/);
      expect(res.body.recordedBy).toBeTruthy();
      expect(res.body.measuredOn.slice(0, 10)).toBe('2026-07-01');
    });

    it('accepts a partial set, since a trainer rarely measures everything', async () => {
      const res = await record({ measuredOn: '2026-07-08', weightKg: 89 }).expect(201);

      expect(res.body.weightKg).toBe('89.00');
      expect(res.body.bodyFatPercent).toBeNull();
      expect(res.body.waistCm).toBeNull();
    });

    it('refuses a second set for the same member and date', async () => {
      await record({ measuredOn: '2026-07-01', weightKg: 90 }).expect(201);

      const res = await record({ measuredOn: '2026-07-01', weightKg: 91 }).expect(409);
      expect(res.body.details).toEqual([
        { field: 'measuredOn', messages: ['one set of measurements per member per date'] },
      ]);
    });

    it('allows the same date for a different member', async () => {
      await record({ measuredOn: '2026-07-01', weightKg: 90 }).expect(201);

      await request(server)
        .post('/api/v1/measurements')
        .set(...asAdmin())
        .send({ memberId: unassigned.memberId, measuredOn: '2026-07-01', weightKg: 70 })
        .expect(201);
    });

    it.each([
      ['an impossibly low weight', { weightKg: 5 }],
      ['an impossibly high weight', { weightKg: 900 }],
      ['an impossible height', { heightCm: 10 }],
      ['body fat above 80%', { bodyFatPercent: 95 }],
      ['a resting heart rate of zero', { restingHeartRate: 0 }],
      ['three decimal places on weight', { weightKg: 80.123 }],
      ['a non-ISO date', { measuredOn: '01/07/2026' }],
    ])('rejects %s', async (_label, body) => {
      await record({ measuredOn: '2026-07-01', weightKg: 85, ...body }).expect(400);
    });

    it('corrects a reading without blanking the others', async () => {
      const created = await record({
        measuredOn: '2026-07-01',
        weightKg: 90,
        waistCm: 100,
      }).expect(201);

      const res = await request(server)
        .patch(`/api/v1/measurements/${created.body.id}`)
        .set(...asTrainer())
        .send({ weightKg: 89.5 })
        .expect(200);

      expect(res.body.weightKg).toBe('89.50');
      expect(res.body.waistCm).toBe('100.0');
    });

    it('deletes a mistaken set', async () => {
      const created = await record({ measuredOn: '2026-07-01', weightKg: 90 }).expect(201);

      await request(server)
        .delete(`/api/v1/measurements/${created.body.id}`)
        .set(...asTrainer())
        .expect(204);

      expect(await ctx.prisma.memberMeasurement.count()).toBe(0);
    });
  });

  describe('progress', () => {
    beforeEach(async () => {
      // Weight weekly, body fat and waist monthly — deliberately sparse.
      await record({
        measuredOn: '2026-07-01',
        weightKg: 90,
        heightCm: 180,
        bodyFatPercent: 24,
        waistCm: 100,
      }).expect(201);
      await record({ measuredOn: '2026-08-01', weightKg: 88 }).expect(201);
      await record({ measuredOn: '2026-09-01', weightKg: 86 }).expect(201);
      await record({
        measuredOn: '2026-10-01',
        weightKg: 84,
        bodyFatPercent: 21,
        waistCm: 94,
      }).expect(201);
    });

    const progress = (token: [string, string], memberId = assigned.memberId) =>
      request(server)
        .get(`/api/v1/measurements/progress/members/${memberId}`)
        .set(...token);

    it('reports the first-to-latest change for each metric', async () => {
      const res = await progress(asTrainer()).expect(200);

      expect(res.body.measurementCount).toBe(4);

      const byMetric = Object.fromEntries(
        (res.body.progress as Array<{ metric: string }>).map((p) => [p.metric, p]),
      );

      expect(byMetric.weightKg).toEqual(
        expect.objectContaining({
          first: 90,
          latest: 84,
          change: -6,
          changePercent: -6.67,
          readings: 4,
        }),
      );
      expect(byMetric.bodyFatPercent).toEqual(
        expect.objectContaining({ first: 24, latest: 21, change: -3, readings: 2 }),
      );
      expect(byMetric.waistCm).toEqual(
        expect.objectContaining({ first: 100, latest: 94, change: -6, readings: 2 }),
      );
    });

    it('omits height, which has only one reading', async () => {
      const res = await progress(asTrainer()).expect(200);

      const metrics = (res.body.progress as Array<{ metric: string }>).map((p) => p.metric);
      expect(metrics).not.toContain('heightCm');
    });

    it('reports the latest value of every metric, including the sparse ones', async () => {
      const res = await progress(asTrainer()).expect(200);

      expect(res.body.current).toEqual(
        expect.objectContaining({ weightKg: 84, heightCm: 180, bodyFatPercent: 21, waistCm: 94 }),
      );
    });

    it('computes BMI from the latest weight and the older height', async () => {
      const res = await progress(asTrainer()).expect(200);
      // 84 / 1.8^2 = 25.93
      expect(res.body.bmi).toBe(25.93);
    });

    it('reports no BMI when height was never recorded', async () => {
      const res = await request(server)
        .post('/api/v1/measurements')
        .set(...asAdmin())
        .send({ memberId: unassigned.memberId, measuredOn: '2026-10-01', weightKg: 70 })
        .expect(201);
      expect(res.body.heightCm).toBeNull();

      const theirs = await progress(asAdmin(), unassigned.memberId).expect(200);
      expect(theirs.body.bmi).toBeNull();
    });

    it('narrows the series to a date range', async () => {
      const res = await request(server)
        .get(`/api/v1/measurements/progress/members/${assigned.memberId}`)
        .query({ from: '2026-09-01', to: '2026-10-01' })
        .set(...asTrainer())
        .expect(200);

      expect(res.body.measurementCount).toBe(2);
      const weight = (res.body.progress as Array<{ metric: string; first: number }>).find(
        (p) => p.metric === 'weightKg',
      );
      expect(weight?.first).toBe(86);
    });

    it('returns an empty progress list for a member with no measurements', async () => {
      const res = await progress(asAdmin(), unassigned.memberId).expect(200);

      expect(res.body.measurementCount).toBe(0);
      expect(res.body.progress).toEqual([]);
      expect(res.body.current).toEqual({});
      expect(res.body.bmi).toBeNull();
    });

    it('lets a member read their own progress', async () => {
      const res = await request(server)
        .get('/api/v1/measurements/progress/me')
        .set(...bearer(assigned.accessToken))
        .expect(200);

      expect(res.body.memberId).toBe(assigned.memberId);
      expect(res.body.measurementCount).toBe(4);
      expect(res.body.bmi).toBe(25.93);
    });

    it('lets a member read their own measurement history', async () => {
      const res = await request(server)
        .get('/api/v1/measurements/me')
        .set(...bearer(assigned.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(4);
      // Newest first.
      expect(res.body.data[0].measuredOn.slice(0, 10)).toBe('2026-10-01');
    });
  });

  describe('authorization', () => {
    it('a member cannot record or change measurements', async () => {
      await request(server)
        .post('/api/v1/measurements')
        .set(...bearer(assigned.accessToken))
        .send({ memberId: assigned.memberId, measuredOn: '2026-10-02', weightKg: 70 })
        .expect(403);

      const created = await record({ measuredOn: '2026-10-01', weightKg: 90 }).expect(201);

      await request(server)
        .patch(`/api/v1/measurements/${created.body.id}`)
        .set(...bearer(assigned.accessToken))
        .send({ weightKg: 70 })
        .expect(403);
      await request(server)
        .delete(`/api/v1/measurements/${created.body.id}`)
        .set(...bearer(assigned.accessToken))
        .expect(403);
    });

    it("a member cannot read another member's measurements or progress", async () => {
      const theirs = await request(server)
        .post('/api/v1/measurements')
        .set(...asAdmin())
        .send({ memberId: unassigned.memberId, measuredOn: '2026-10-01', weightKg: 70 })
        .expect(201);

      await request(server)
        .get(`/api/v1/measurements/${theirs.body.id}`)
        .set(...bearer(assigned.accessToken))
        .expect(404);
      await request(server)
        .get(`/api/v1/measurements/progress/members/${unassigned.memberId}`)
        .set(...bearer(assigned.accessToken))
        .expect(403);
    });

    it('a trainer cannot reach an unassigned member', async () => {
      await request(server)
        .post('/api/v1/measurements')
        .set(...asTrainer())
        .send({ memberId: unassigned.memberId, measuredOn: '2026-10-01', weightKg: 70 })
        .expect(404);
      await request(server)
        .get(`/api/v1/measurements/progress/members/${unassigned.memberId}`)
        .set(...asTrainer())
        .expect(404);
    });

    it('a trainer loses access when the member is reassigned away', async () => {
      const created = await record({ measuredOn: '2026-10-01', weightKg: 90 }).expect(201);

      await ctx.prisma.member.update({
        where: { id: assigned.memberId },
        data: { assignedTrainerId: null },
      });

      await request(server)
        .get(`/api/v1/measurements/${created.body.id}`)
        .set(...asTrainer())
        .expect(404);
      await request(server)
        .patch(`/api/v1/measurements/${created.body.id}`)
        .set(...asTrainer())
        .send({ weightKg: 85 })
        .expect(404);
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/measurements').expect(401);
      await request(server).get('/api/v1/measurements/progress/me').expect(401);
    });
  });
});
