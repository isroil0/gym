import { TrainingSessionStatus, UserRole } from '@prisma/client';
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

const DAY = '2026-11-10';
const at = (time: string) => `${DAY}T${time}:00.000Z`;

describe('Personal training sessions and trainer schedule (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;
  let tina: Awaited<ReturnType<typeof seedTrainerProfile>>;
  let sam: Awaited<ReturnType<typeof seedTrainerProfile>>;
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
    tina = await seedTrainerProfile(ctx, server, { email: 'tina@gym.test', firstName: 'Tina' });
    sam = await seedTrainerProfile(ctx, server, { email: 'sam@gym.test', firstName: 'Sam' });
    assigned = await seedMemberProfile(ctx, server, {
      email: 'mine@gym.test',
      assignedTrainerId: tina.trainerId,
    });
    unassigned = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });
  });

  const asTina = () => bearer(tina.accessToken);
  const asAdmin = () => bearer(admin.accessToken);

  const book = (token: [string, string], body: Record<string, unknown> = {}) =>
    request(server)
      .post('/api/v1/training-sessions')
      .set(...token)
      .send({
        memberId: assigned.memberId,
        startsAt: at('09:00'),
        endsAt: at('10:00'),
        ...body,
      });

  describe('booking', () => {
    it('books a session for an assigned member', async () => {
      const res = await book(asTina(), { location: 'Studio 2' }).expect(201);

      expect(res.body.status).toBe(TrainingSessionStatus.SCHEDULED);
      expect(res.body.durationMinutes).toBe(60);
      expect(res.body.trainerId).toBe(tina.trainerId);
      expect(res.body.trainerName).toContain('Tina');
      expect(res.body.memberCode).toMatch(/^M-\d{6}$/);
      expect(res.body.location).toBe('Studio 2');
      expect(res.body.completedAt).toBeNull();
    });

    it('refuses a trainer booking for an unassigned member, as not found', async () => {
      await book(asTina(), { memberId: unassigned.memberId }).expect(404);
    });

    it("refuses a trainer booking into a colleague's diary", async () => {
      await book(asTina(), { trainerId: sam.trainerId }).expect(403);
    });

    it('requires an administrator to name the trainer', async () => {
      const res = await book(asAdmin()).expect(422);
      expect(res.body.details).toEqual([{ field: 'trainerId', messages: ['is required'] }]);
    });

    it('lets an administrator book for any trainer and member', async () => {
      await book(asAdmin(), {
        memberId: unassigned.memberId,
        trainerId: sam.trainerId,
      }).expect(201);
    });

    it('allows back-to-back sessions', async () => {
      await book(asTina()).expect(201);
      await book(asTina(), { startsAt: at('10:00'), endsAt: at('11:00') }).expect(201);
    });

    it('refuses an overlapping session for the same trainer', async () => {
      const other = await seedMemberProfile(ctx, server, {
        email: 'second@gym.test',
        assignedTrainerId: tina.trainerId,
      });
      await book(asTina()).expect(201);

      const res = await book(asTina(), {
        memberId: other.memberId,
        startsAt: at('09:30'),
        endsAt: at('10:30'),
      }).expect(409);

      expect(res.body.details).toEqual([
        { field: 'startsAt', messages: ['clashes with another session for this trainer'] },
      ]);
    });

    it('refuses an overlapping session for the same member, even with another trainer', async () => {
      await book(asTina()).expect(201);

      const res = await request(server)
        .post('/api/v1/training-sessions')
        .set(...asAdmin())
        .send({
          memberId: assigned.memberId,
          trainerId: sam.trainerId,
          startsAt: at('09:30'),
          endsAt: at('10:30'),
        })
        .expect(409);

      expect(res.body.details).toEqual([
        { field: 'startsAt', messages: ['clashes with another session for this member'] },
      ]);
    });

    it('frees the slot once a session is cancelled', async () => {
      const first = await book(asTina()).expect(201);

      await request(server)
        .post(`/api/v1/training-sessions/${first.body.id}/cancel`)
        .set(...asTina())
        .send({ reason: 'Member unwell' })
        .expect(200);

      await book(asTina()).expect(201);
    });

    it.each([
      ['a zero-length window', { endsAt: at('09:00') }],
      ['an inverted window', { endsAt: at('08:00') }],
      ['a two-minute window', { endsAt: at('09:02') }],
      ['a nine-hour window', { endsAt: `${DAY}T18:30:00.000Z` }],
    ])('refuses %s', async (_label, body) => {
      await book(asTina(), body).expect(422);
    });

    it('rejects a malformed timestamp', async () => {
      await book(asTina(), { startsAt: 'tomorrow morning' }).expect(400);
    });
  });

  describe('lifecycle', () => {
    let sessionId: string;

    beforeEach(async () => {
      sessionId = (await book(asTina()).expect(201)).body.id as string;
    });

    it('reschedules, keeping the length when only the start moves', async () => {
      const res = await request(server)
        .patch(`/api/v1/training-sessions/${sessionId}`)
        .set(...asTina())
        .send({ startsAt: at('14:00') })
        .expect(200);

      expect(res.body.startsAt).toBe(at('14:00'));
      expect(res.body.endsAt).toBe(at('15:00'));
      expect(res.body.durationMinutes).toBe(60);
    });

    it('completes with notes', async () => {
      const res = await request(server)
        .post(`/api/v1/training-sessions/${sessionId}/complete`)
        .set(...asTina())
        .send({ trainerNotes: 'Hit 95kg x3' })
        .expect(200);

      expect(res.body.status).toBe(TrainingSessionStatus.COMPLETED);
      expect(res.body.completedAt).not.toBeNull();
      expect(res.body.trainerNotes).toBe('Hit 95kg x3');
    });

    it('cancels with a reason', async () => {
      const res = await request(server)
        .post(`/api/v1/training-sessions/${sessionId}/cancel`)
        .set(...asTina())
        .send({ reason: 'Member unwell' })
        .expect(200);

      expect(res.body.status).toBe(TrainingSessionStatus.CANCELLED);
      expect(res.body.cancelledAt).not.toBeNull();
      expect(res.body.cancellationReason).toBe('Member unwell');
    });

    it('records a no-show, which is not a cancellation', async () => {
      const res = await request(server)
        .post(`/api/v1/training-sessions/${sessionId}/no-show`)
        .set(...asTina())
        .expect(200);

      expect(res.body.status).toBe(TrainingSessionStatus.NO_SHOW);
      expect(res.body.cancelledAt).toBeNull();
    });

    it.each(['complete', 'cancel', 'no-show'])(
      'refuses to %s a session that is already finished, as a conflict',
      async (action) => {
        await request(server)
          .post(`/api/v1/training-sessions/${sessionId}/complete`)
          .set(...asTina())
          .send({})
          .expect(200);

        await request(server)
          .post(`/api/v1/training-sessions/${sessionId}/${action}`)
          .set(...asTina())
          .send({})
          .expect(409);
      },
    );

    it('refuses to reschedule a finished session, with the same status as the others', async () => {
      await request(server)
        .post(`/api/v1/training-sessions/${sessionId}/complete`)
        .set(...asTina())
        .send({})
        .expect(200);

      // 409 like cancel and complete: all three are the same class of problem.
      await request(server)
        .patch(`/api/v1/training-sessions/${sessionId}`)
        .set(...asTina())
        .send({ startsAt: at('14:00') })
        .expect(409);
    });

    it('refuses to reschedule onto another booking', async () => {
      await book(asTina(), { startsAt: at('14:00'), endsAt: at('15:00') }).expect(201);

      await request(server)
        .patch(`/api/v1/training-sessions/${sessionId}`)
        .set(...asTina())
        .send({ startsAt: at('14:30'), endsAt: at('15:30') })
        .expect(409);
    });

    it('allows a no-op reschedule of the same slot', async () => {
      await request(server)
        .patch(`/api/v1/training-sessions/${sessionId}`)
        .set(...asTina())
        .send({ startsAt: at('09:00'), endsAt: at('10:00') })
        .expect(200);
    });
  });

  describe('schedule views', () => {
    beforeEach(async () => {
      await book(asTina(), { startsAt: at('09:00'), endsAt: at('10:00') }).expect(201);
      await book(asTina(), { startsAt: at('11:00'), endsAt: at('12:00') }).expect(201);
      await request(server)
        .post('/api/v1/training-sessions')
        .set(...asAdmin())
        .send({
          memberId: unassigned.memberId,
          trainerId: sam.trainerId,
          startsAt: at('09:00'),
          endsAt: at('10:00'),
        })
        .expect(201);
    });

    it('gives a trainer their own diary, earliest first', async () => {
      const res = await request(server)
        .get('/api/v1/training-sessions/me')
        .set(...asTina())
        .expect(200);

      expect(res.body.meta.total).toBe(2);
      expect(res.body.data[0].startsAt).toBe(at('09:00'));
      expect(res.body.data[1].startsAt).toBe(at('11:00'));
    });

    it("keeps a session in the trainer's diary after the member is reassigned", async () => {
      await ctx.prisma.member.update({
        where: { id: assigned.memberId },
        data: { assignedTrainerId: sam.trainerId },
      });

      // The trainer still committed that time, so it stays on their schedule...
      const schedule = await request(server)
        .get('/api/v1/training-sessions/me')
        .set(...asTina())
        .expect(200);
      expect(schedule.body.meta.total).toBe(2);

      // ...even though the member is no longer theirs to manage.
      const list = await request(server)
        .get('/api/v1/training-sessions')
        .set(...asTina())
        .expect(200);
      expect(list.body.meta.total).toBe(0);
    });

    it("lets an administrator read any trainer's schedule", async () => {
      const res = await request(server)
        .get(`/api/v1/training-sessions/schedule/trainers/${sam.trainerId}`)
        .set(...asAdmin())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].trainerName).toContain('Sam');
    });

    it('filters a schedule by a bare date range, inclusive of the end day', async () => {
      const res = await request(server)
        .get(`/api/v1/training-sessions/schedule/trainers/${tina.trainerId}`)
        .query({ from: DAY, to: DAY })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.meta.total).toBe(2);
    });

    it('excludes a day outside the range', async () => {
      const res = await request(server)
        .get(`/api/v1/training-sessions/schedule/trainers/${tina.trainerId}`)
        .query({ from: '2026-12-01', to: '2026-12-31' })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });

    it('filters by status', async () => {
      const sessions = await request(server)
        .get('/api/v1/training-sessions/me')
        .set(...asTina())
        .expect(200);

      await request(server)
        .post(`/api/v1/training-sessions/${sessions.body.data[0].id}/complete`)
        .set(...asTina())
        .send({})
        .expect(200);

      const completed = await request(server)
        .get('/api/v1/training-sessions/me')
        .query({ status: TrainingSessionStatus.COMPLETED })
        .set(...asTina())
        .expect(200);

      expect(completed.body.meta.total).toBe(1);
    });

    it('gives a member their own sessions', async () => {
      const res = await request(server)
        .get('/api/v1/training-sessions/me')
        .set(...bearer(assigned.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(2);
    });

    it('a trainer sees only their assigned members in the general list', async () => {
      const res = await request(server)
        .get('/api/v1/training-sessions')
        .set(...asTina())
        .expect(200);

      expect(res.body.meta.total).toBe(2);
    });
  });

  describe('authorization', () => {
    let sessionId: string;

    beforeEach(async () => {
      sessionId = (await book(asTina()).expect(201)).body.id as string;
    });

    it('a member cannot book, reschedule, complete or cancel', async () => {
      await book(bearer(assigned.accessToken)).expect(403);

      for (const path of ['complete', 'cancel', 'no-show']) {
        await request(server)
          .post(`/api/v1/training-sessions/${sessionId}/${path}`)
          .set(...bearer(assigned.accessToken))
          .send({})
          .expect(403);
      }

      await request(server)
        .patch(`/api/v1/training-sessions/${sessionId}`)
        .set(...bearer(assigned.accessToken))
        .send({ startsAt: at('14:00') })
        .expect(403);
    });

    it("a member cannot read another member's session", async () => {
      await request(server)
        .get(`/api/v1/training-sessions/${sessionId}`)
        .set(...bearer(unassigned.accessToken))
        .expect(404);
    });

    it("a trainer cannot touch a colleague's session, even for a shared member", async () => {
      const theirs = await request(server)
        .post('/api/v1/training-sessions')
        .set(...asAdmin())
        .send({
          memberId: assigned.memberId,
          trainerId: sam.trainerId,
          startsAt: at('16:00'),
          endsAt: at('17:00'),
        })
        .expect(201);

      // Tina manages this member, but the session is Sam's diary entry.
      await request(server)
        .post(`/api/v1/training-sessions/${theirs.body.id}/cancel`)
        .set(...asTina())
        .send({})
        .expect(404);
    });

    it('a member cannot read a trainer schedule', async () => {
      await request(server)
        .get(`/api/v1/training-sessions/schedule/trainers/${tina.trainerId}`)
        .set(...bearer(assigned.accessToken))
        .expect(403);
    });

    it("a trainer cannot read another trainer's schedule directly", async () => {
      await request(server)
        .get(`/api/v1/training-sessions/schedule/trainers/${sam.trainerId}`)
        .set(...asTina())
        .expect(403);
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/training-sessions').expect(401);
      await request(server).get('/api/v1/training-sessions/me').expect(401);
    });
  });
});
