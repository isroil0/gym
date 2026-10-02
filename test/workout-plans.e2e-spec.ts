import { UserRole, WorkoutPlanStatus } from '@prisma/client';
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

describe('Workout plans (e2e)', () => {
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
    trainer = await seedTrainerProfile(ctx, server, { email: 'tina@gym.test', firstName: 'Tina' });
    assigned = await seedMemberProfile(ctx, server, {
      email: 'mine@gym.test',
      assignedTrainerId: trainer.trainerId,
    });
    unassigned = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });
  });

  const asTrainer = () => bearer(trainer.accessToken);
  const asAdmin = () => bearer(admin.accessToken);

  const createPlan = (token: [string, string], body: Record<string, unknown> = {}) =>
    request(server)
      .post('/api/v1/workout-plans')
      .set(...token)
      .send({ memberId: assigned.memberId, name: 'Autumn strength', ...body });

  describe('creating a plan', () => {
    it('records the authoring trainer and the member', async () => {
      const res = await createPlan(asTrainer(), {
        goal: 'First 100kg squat',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        trainerNotes: 'Four days a week',
      }).expect(201);

      expect(res.body.name).toBe('Autumn strength');
      expect(res.body.goal).toBe('First 100kg squat');
      expect(res.body.trainerId).toBe(trainer.trainerId);
      expect(res.body.trainerName).toContain('Tina');
      expect(res.body.memberCode).toMatch(/^M-\d{6}$/);
      expect(res.body.status).toBe(WorkoutPlanStatus.ACTIVE);
      expect(res.body.dayCount).toBe(0);
      expect(res.body.exerciseCount).toBe(0);
      expect(res.body.trainerNotes).toBe('Four days a week');
    });

    it('leaves the author unset when an administrator writes it', async () => {
      const res = await createPlan(asAdmin()).expect(201);
      expect(res.body.trainerId).toBeNull();
    });

    it('refuses a trainer writing for an unassigned member, as not found', async () => {
      const res = await request(server)
        .post('/api/v1/workout-plans')
        .set(...asTrainer())
        .send({ memberId: unassigned.memberId, name: 'Nope' })
        .expect(404);

      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('lets an administrator write for any member', async () => {
      await request(server)
        .post('/api/v1/workout-plans')
        .set(...asAdmin())
        .send({ memberId: unassigned.memberId, name: 'Admin plan' })
        .expect(201);
    });

    it('rejects an end date before the start date', async () => {
      await createPlan(asTrainer(), { startDate: '2026-12-01', endDate: '2026-10-01' }).expect(422);
    });

    it('rejects unknown properties', async () => {
      await createPlan(asTrainer(), { status: WorkoutPlanStatus.ARCHIVED }).expect(400);
    });
  });

  describe('days and exercises', () => {
    let planId: string;

    beforeEach(async () => {
      planId = (await createPlan(asTrainer()).expect(201)).body.id as string;
    });

    const addDay = (body: Record<string, unknown>) =>
      request(server)
        .post(`/api/v1/workout-plans/${planId}/days`)
        .set(...asTrainer())
        .send(body);

    it('builds a plan out of days and exercises, ordered as written', async () => {
      const first = await addDay({ dayOrder: 1, name: 'Push day' }).expect(201);
      const dayId = first.body.days[0].id as string;
      await addDay({ dayOrder: 2, name: 'Pull day' }).expect(201);

      await request(server)
        .post(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises`)
        .set(...asTrainer())
        .send({
          exerciseOrder: 2,
          name: 'Incline press',
          sets: 3,
          reps: 'AMRAP',
          weight: 27.5,
          weightUnit: 'LB',
        })
        .expect(201);

      const res = await request(server)
        .post(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises`)
        .set(...asTrainer())
        .send({
          exerciseOrder: 1,
          name: 'Barbell bench press',
          targetMuscleGroup: 'Chest',
          sets: 4,
          reps: '8-12',
          weight: 80,
          restSeconds: 90,
          tempo: '3-1-2-0',
        })
        .expect(201);

      expect(res.body.dayCount).toBe(2);
      expect(res.body.exerciseCount).toBe(2);
      expect(res.body.days.map((d: { name: string }) => d.name)).toEqual(['Push day', 'Pull day']);

      const exercises = res.body.days[0].exercises as Array<Record<string, unknown>>;
      expect(exercises.map((e) => e.name)).toEqual(['Barbell bench press', 'Incline press']);
      expect(exercises[0]).toEqual(
        expect.objectContaining({
          sets: 4,
          reps: '8-12',
          weight: '80.00',
          weightUnit: 'KG',
          restSeconds: 90,
          tempo: '3-1-2-0',
          targetMuscleGroup: 'Chest',
        }),
      );
      expect(exercises[1]).toEqual(
        expect.objectContaining({ reps: 'AMRAP', weight: '27.50', weightUnit: 'LB' }),
      );
    });

    it('refuses a duplicate day position', async () => {
      await addDay({ dayOrder: 1, name: 'Push day' }).expect(201);

      const res = await addDay({ dayOrder: 1, name: 'Clash' }).expect(409);
      expect(res.body.details).toEqual([
        { field: 'dayOrder', messages: ['must be unique within the plan'] },
      ]);
    });

    it('refuses a duplicate exercise position within a day', async () => {
      const day = await addDay({ dayOrder: 1, name: 'Push day' }).expect(201);
      const dayId = day.body.days[0].id as string;

      const exercise = { exerciseOrder: 1, name: 'Bench', sets: 4, reps: '8' };
      await request(server)
        .post(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises`)
        .set(...asTrainer())
        .send(exercise)
        .expect(201);
      await request(server)
        .post(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises`)
        .set(...asTrainer())
        .send({ ...exercise, name: 'Clash' })
        .expect(409);
    });

    it('allows the same position in a different day', async () => {
      const a = await addDay({ dayOrder: 1, name: 'Push' }).expect(201);
      const b = await addDay({ dayOrder: 2, name: 'Pull' }).expect(201);

      const dayA = a.body.days[0].id as string;
      const dayB = (b.body.days as Array<{ id: string; name: string }>).find(
        (d) => d.name === 'Pull',
      )!.id;

      for (const dayId of [dayA, dayB]) {
        await request(server)
          .post(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises`)
          .set(...asTrainer())
          .send({ exerciseOrder: 1, name: 'First', sets: 3, reps: '10' })
          .expect(201);
      }
    });

    it('updates and removes an exercise', async () => {
      const day = await addDay({ dayOrder: 1, name: 'Push day' }).expect(201);
      const dayId = day.body.days[0].id as string;

      const added = await request(server)
        .post(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises`)
        .set(...asTrainer())
        .send({ exerciseOrder: 1, name: 'Bench', sets: 4, reps: '8' })
        .expect(201);
      const exerciseId = added.body.days[0].exercises[0].id as string;

      const updated = await request(server)
        .patch(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises/${exerciseId}`)
        .set(...asTrainer())
        .send({ sets: 5, reps: '6-8' })
        .expect(200);
      expect(updated.body.days[0].exercises[0]).toEqual(
        expect.objectContaining({ sets: 5, reps: '6-8', name: 'Bench' }),
      );

      const removed = await request(server)
        .delete(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises/${exerciseId}`)
        .set(...asTrainer())
        .expect(200);
      expect(removed.body.exerciseCount).toBe(0);
    });

    it('removes a day along with its exercises', async () => {
      const day = await addDay({ dayOrder: 1, name: 'Push day' }).expect(201);
      const dayId = day.body.days[0].id as string;
      await request(server)
        .post(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises`)
        .set(...asTrainer())
        .send({ exerciseOrder: 1, name: 'Bench', sets: 4, reps: '8' })
        .expect(201);

      const res = await request(server)
        .delete(`/api/v1/workout-plans/${planId}/days/${dayId}`)
        .set(...asTrainer())
        .expect(200);

      expect(res.body.dayCount).toBe(0);
      expect(res.body.exerciseCount).toBe(0);
      expect(await ctx.prisma.workoutExercise.count()).toBe(0);
    });

    it('rejects a day from another plan', async () => {
      const otherPlan = await createPlan(asAdmin(), { name: 'Other' }).expect(201);
      const otherDay = await request(server)
        .post(`/api/v1/workout-plans/${otherPlan.body.id}/days`)
        .set(...asAdmin())
        .send({ dayOrder: 1, name: 'Theirs' })
        .expect(201);

      await request(server)
        .patch(`/api/v1/workout-plans/${planId}/days/${otherDay.body.days[0].id}`)
        .set(...asTrainer())
        .send({ name: 'Hijack' })
        .expect(404);
    });

    it.each([
      ['zero sets', { exerciseOrder: 1, name: 'X', sets: 0, reps: '8' }],
      ['empty reps', { exerciseOrder: 1, name: 'X', sets: 3, reps: '' }],
      ['a negative load', { exerciseOrder: 1, name: 'X', sets: 3, reps: '8', weight: -5 }],
      [
        'an unknown weight unit',
        { exerciseOrder: 1, name: 'X', sets: 3, reps: '8', weightUnit: 'STONE' },
      ],
      [
        'rest beyond an hour',
        { exerciseOrder: 1, name: 'X', sets: 3, reps: '8', restSeconds: 4000 },
      ],
    ])('rejects %s', async (_label, body) => {
      const day = await addDay({ dayOrder: 1, name: 'Push day' }).expect(201);
      const dayId = day.body.days[0].id as string;

      await request(server)
        .post(`/api/v1/workout-plans/${planId}/days/${dayId}/exercises`)
        .set(...asTrainer())
        .send(body)
        .expect(400);
    });
  });

  describe('reading', () => {
    let planId: string;

    beforeEach(async () => {
      const plan = await createPlan(asTrainer()).expect(201);
      planId = plan.body.id as string;
      await request(server)
        .post(`/api/v1/workout-plans/${planId}/days`)
        .set(...asTrainer())
        .send({ dayOrder: 1, name: 'Push day' })
        .expect(201);
    });

    it('omits the programme from a list but keeps the counts', async () => {
      const res = await request(server)
        .get('/api/v1/workout-plans')
        .set(...asTrainer())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].dayCount).toBe(1);
      expect(res.body.data[0]).not.toHaveProperty('days');
    });

    it('returns the full programme on a detail read', async () => {
      const res = await request(server)
        .get(`/api/v1/workout-plans/${planId}`)
        .set(...asTrainer())
        .expect(200);

      expect(res.body.days).toHaveLength(1);
      expect(res.body.days[0].exercises).toEqual([]);
    });

    it('filters by member and status and searches name or goal', async () => {
      await createPlan(asAdmin(), {
        memberId: unassigned.memberId,
        name: 'Beach body',
        goal: 'Lose 5kg',
      }).expect(201);

      const byMember = await request(server)
        .get('/api/v1/workout-plans')
        .query({ memberId: unassigned.memberId })
        .set(...asAdmin())
        .expect(200);
      expect(byMember.body.meta.total).toBe(1);

      const byGoal = await request(server)
        .get('/api/v1/workout-plans')
        .query({ search: 'lose' })
        .set(...asAdmin())
        .expect(200);
      expect(byGoal.body.meta.total).toBe(1);
    });

    it('gives a member their own plan, including the coaching notes', async () => {
      await request(server)
        .patch(`/api/v1/workout-plans/${planId}`)
        .set(...asTrainer())
        .send({ trainerNotes: 'Push hard on week three' })
        .expect(200);

      const list = await request(server)
        .get('/api/v1/workout-plans/me')
        .set(...bearer(assigned.accessToken))
        .expect(200);
      expect(list.body.meta.total).toBe(1);

      const detail = await request(server)
        .get(`/api/v1/workout-plans/${planId}`)
        .set(...bearer(assigned.accessToken))
        .expect(200);
      // The point of a plan is that the member reads it.
      expect(detail.body.trainerNotes).toBe('Push hard on week three');
      expect(detail.body.days).toHaveLength(1);
    });
  });

  describe('archive and reactivate', () => {
    let planId: string;

    beforeEach(async () => {
      planId = (await createPlan(asTrainer()).expect(201)).body.id as string;
    });

    it('archives and reactivates, keeping the plan in the history', async () => {
      const archived = await request(server)
        .post(`/api/v1/workout-plans/${planId}/archive`)
        .set(...asTrainer())
        .expect(200);
      expect(archived.body.status).toBe(WorkoutPlanStatus.ARCHIVED);
      expect(archived.body.archivedAt).not.toBeNull();

      await request(server)
        .post(`/api/v1/workout-plans/${planId}/archive`)
        .set(...asTrainer())
        .expect(409);

      const reactivated = await request(server)
        .post(`/api/v1/workout-plans/${planId}/reactivate`)
        .set(...asTrainer())
        .expect(200);
      expect(reactivated.body.status).toBe(WorkoutPlanStatus.ACTIVE);
      expect(reactivated.body.archivedAt).toBeNull();
    });

    it('still lets the member read an archived plan', async () => {
      await request(server)
        .post(`/api/v1/workout-plans/${planId}/archive`)
        .set(...asTrainer())
        .expect(200);

      await request(server)
        .get(`/api/v1/workout-plans/${planId}`)
        .set(...bearer(assigned.accessToken))
        .expect(200);
    });
  });

  describe('authorization', () => {
    let planId: string;

    beforeEach(async () => {
      planId = (await createPlan(asTrainer()).expect(201)).body.id as string;
    });

    it('a member cannot change their own plan', async () => {
      await request(server)
        .patch(`/api/v1/workout-plans/${planId}`)
        .set(...bearer(assigned.accessToken))
        .send({ name: 'Easier plan' })
        .expect(403);

      await request(server)
        .post(`/api/v1/workout-plans/${planId}/days`)
        .set(...bearer(assigned.accessToken))
        .send({ dayOrder: 9, name: 'Rest day' })
        .expect(403);
    });

    it('a member cannot create a plan at all', async () => {
      await request(server)
        .post('/api/v1/workout-plans')
        .set(...bearer(assigned.accessToken))
        .send({ memberId: assigned.memberId, name: 'Mine' })
        .expect(403);
    });

    it("a member cannot see another member's plan", async () => {
      await request(server)
        .get(`/api/v1/workout-plans/${planId}`)
        .set(...bearer(unassigned.accessToken))
        .expect(404);
    });

    it("a trainer cannot touch an unassigned member's plan", async () => {
      const otherPlan = await createPlan(asAdmin(), {
        memberId: unassigned.memberId,
        name: 'Not yours',
      }).expect(201);

      await request(server)
        .get(`/api/v1/workout-plans/${otherPlan.body.id}`)
        .set(...asTrainer())
        .expect(404);
      await request(server)
        .patch(`/api/v1/workout-plans/${otherPlan.body.id}`)
        .set(...asTrainer())
        .send({ name: 'Hijack' })
        .expect(404);
      await request(server)
        .post(`/api/v1/workout-plans/${otherPlan.body.id}/days`)
        .set(...asTrainer())
        .send({ dayOrder: 1, name: 'Hijack' })
        .expect(404);
    });

    it('loses access when the member is reassigned away', async () => {
      await ctx.prisma.member.update({
        where: { id: assigned.memberId },
        data: { assignedTrainerId: null },
      });

      await request(server)
        .get(`/api/v1/workout-plans/${planId}`)
        .set(...asTrainer())
        .expect(404);
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/workout-plans').expect(401);
      await request(server).get(`/api/v1/workout-plans/${planId}`).expect(401);
    });
  });
});
