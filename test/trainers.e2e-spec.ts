import { ProfileStatus, UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import {
  TEST_PASSWORD,
  bearer,
  seedAndLogin,
  seedMemberProfile,
  seedTrainerProfile,
  seedUser,
  type SignedInUser,
} from './utils/auth';

describe('Trainers (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;

  const newTrainer = {
    email: 'Tina.Trainer@Gym.TEST',
    password: 'TrainerPass1',
    firstName: 'Tina',
    lastName: 'Trainer',
    specialization: 'Strength & conditioning',
    certifications: 'NASM-CPT',
  };

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

  describe('POST /trainers', () => {
    it('creates the account and the profile together', async () => {
      const res = await request(server)
        .post('/api/v1/trainers')
        .set(...bearer(admin.accessToken))
        .send(newTrainer)
        .expect(201);

      expect(res.body.trainerCode).toMatch(/^T-\d{6}$/);
      expect(res.body.account.email).toBe('tina.trainer@gym.test');
      expect(res.body.specialization).toBe('Strength & conditioning');
      expect(res.body.status).toBe(ProfileStatus.ACTIVE);
      expect(res.body.assignedMemberCount).toBe(0);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('creates an account with role TRAINER that can sign in', async () => {
      await request(server)
        .post('/api/v1/trainers')
        .set(...bearer(admin.accessToken))
        .send(newTrainer)
        .expect(201);

      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'tina.trainer@gym.test', password: newTrainer.password })
        .expect(200);

      expect(login.body.user.role).toBe(UserRole.TRAINER);
    });

    it('links an existing TRAINER account', async () => {
      const { user } = await seedUser(ctx, { role: UserRole.TRAINER, email: 'orphan-t@gym.test' });

      const res = await request(server)
        .post('/api/v1/trainers')
        .set(...bearer(admin.accessToken))
        .send({ userId: user.id, specialization: 'Yoga' })
        .expect(201);

      expect(res.body.account.id).toBe(user.id);
      expect(res.body.specialization).toBe('Yoga');
    });

    it('refuses to link a MEMBER account', async () => {
      const { user } = await seedUser(ctx, { role: UserRole.MEMBER });

      const res = await request(server)
        .post('/api/v1/trainers')
        .set(...bearer(admin.accessToken))
        .send({ userId: user.id })
        .expect(422);

      expect(res.body.message).toMatch(/requires role TRAINER/);
    });

    it('rejects a duplicate email', async () => {
      await request(server)
        .post('/api/v1/trainers')
        .set(...bearer(admin.accessToken))
        .send(newTrainer)
        .expect(201);

      await request(server)
        .post('/api/v1/trainers')
        .set(...bearer(admin.accessToken))
        .send(newTrainer)
        .expect(409);
    });
  });

  describe('GET /trainers', () => {
    beforeEach(async () => {
      await seedTrainerProfile(ctx, server, {
        email: 'strength@gym.test',
        firstName: 'Sam',
        specialization: 'Strength',
      });
      await seedTrainerProfile(ctx, server, {
        email: 'yoga@gym.test',
        firstName: 'Yara',
        specialization: 'Yoga',
      });
    });

    it('lists trainers with their assigned member counts', async () => {
      const res = await request(server)
        .get('/api/v1/trainers')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(2);
      expect(res.body.data[0].assignedMemberCount).toBe(0);
    });

    it('counts assigned members', async () => {
      const trainer = await seedTrainerProfile(ctx, server, { email: 'busy@gym.test' });
      await seedMemberProfile(ctx, server, { assignedTrainerId: trainer.trainerId });
      await seedMemberProfile(ctx, server, { assignedTrainerId: trainer.trainerId });

      const res = await request(server)
        .get(`/api/v1/trainers/${trainer.trainerId}`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.assignedMemberCount).toBe(2);
    });

    it('searches by specialization', async () => {
      const res = await request(server)
        .get('/api/v1/trainers')
        .query({ search: 'yog' })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].account.email).toBe('yoga@gym.test');
    });

    it('searches by trainer code', async () => {
      const listed = await request(server)
        .get('/api/v1/trainers')
        .set(...bearer(admin.accessToken))
        .expect(200);
      const code = listed.body.data[0].trainerCode as string;

      const res = await request(server)
        .get('/api/v1/trainers')
        .query({ search: code })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
    });

    it('returns 404 for an unknown trainer', async () => {
      await request(server)
        .get('/api/v1/trainers/0b5f8a2e-0000-4000-8000-000000000000')
        .set(...bearer(admin.accessToken))
        .expect(404);
    });
  });

  describe('GET /trainers/:id/members', () => {
    it("lists only that trainer's members", async () => {
      const tina = await seedTrainerProfile(ctx, server, { email: 't1@gym.test' });
      const sam = await seedTrainerProfile(ctx, server, { email: 't2@gym.test' });

      await seedMemberProfile(ctx, server, {
        email: 'tina-member@gym.test',
        assignedTrainerId: tina.trainerId,
      });
      await seedMemberProfile(ctx, server, {
        email: 'sam-member@gym.test',
        assignedTrainerId: sam.trainerId,
      });
      await seedMemberProfile(ctx, server, { email: 'nobody@gym.test' });

      const res = await request(server)
        .get(`/api/v1/trainers/${tina.trainerId}/members`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].account.email).toBe('tina-member@gym.test');
    });
  });

  describe('PATCH /trainers/:id', () => {
    it('updates profile and account fields', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      const res = await request(server)
        .patch(`/api/v1/trainers/${trainer.trainerId}`)
        .set(...bearer(admin.accessToken))
        .send({ firstName: 'Renamed', specialization: 'Mobility', bio: 'New bio' })
        .expect(200);

      expect(res.body.account.firstName).toBe('Renamed');
      expect(res.body.specialization).toBe('Mobility');
      expect(res.body.bio).toBe('New bio');
    });

    it('rejects unknown properties', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      await request(server)
        .patch(`/api/v1/trainers/${trainer.trainerId}`)
        .set(...bearer(admin.accessToken))
        .send({ status: ProfileStatus.ARCHIVED })
        .expect(400);
    });
  });

  describe('archive / reactivate', () => {
    it("unassigns the trainer's members and reports how many", async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const memberA = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });
      const memberB = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });

      const res = await request(server)
        .post(`/api/v1/trainers/${trainer.trainerId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.status).toBe(ProfileStatus.ARCHIVED);
      expect(res.body.unassignedMemberCount).toBe(2);

      for (const member of [memberA, memberB]) {
        const reloaded = await request(server)
          .get(`/api/v1/members/${member.memberId}`)
          .set(...bearer(admin.accessToken))
          .expect(200);
        expect(reloaded.body.assignedTrainer).toBeNull();
      }
    });

    it('locks the archived trainer out and revokes their sessions', async () => {
      const trainer = await seedTrainerProfile(ctx, server, { email: 'gone@gym.test' });

      await request(server)
        .post(`/api/v1/trainers/${trainer.trainerId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'gone@gym.test', password: TEST_PASSWORD })
        .expect(403);

      // Revoked credential -> 401; the still-unexpired access token is
      // refused on the live account status -> 403 (asserted below).
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: trainer.refreshToken })
        .expect(401);

      await request(server)
        .get('/api/v1/trainers/me')
        .set(...bearer(trainer.accessToken))
        .expect(403);
    });

    it('refuses to archive twice', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      await request(server)
        .post(`/api/v1/trainers/${trainer.trainerId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);
      await request(server)
        .post(`/api/v1/trainers/${trainer.trainerId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(409);
    });

    it('reactivates without reassigning the former members', async () => {
      const trainer = await seedTrainerProfile(ctx, server, { email: 'back@gym.test' });
      const member = await seedMemberProfile(ctx, server, {
        assignedTrainerId: trainer.trainerId,
      });

      await request(server)
        .post(`/api/v1/trainers/${trainer.trainerId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      const res = await request(server)
        .post(`/api/v1/trainers/${trainer.trainerId}/reactivate`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.status).toBe(ProfileStatus.ACTIVE);
      expect(res.body.account.status).toBe(UserStatus.ACTIVE);

      const reloaded = await request(server)
        .get(`/api/v1/members/${member.memberId}`)
        .set(...bearer(admin.accessToken))
        .expect(200);
      expect(reloaded.body.assignedTrainer).toBeNull();

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'back@gym.test', password: TEST_PASSWORD })
        .expect(200);
    });
  });

  describe('trainer self-service', () => {
    it("returns the trainer's own profile", async () => {
      const trainer = await seedTrainerProfile(ctx, server, { specialization: 'Rehab' });

      const res = await request(server)
        .get('/api/v1/trainers/me')
        .set(...bearer(trainer.accessToken))
        .expect(200);

      expect(res.body.id).toBe(trainer.trainerId);
      expect(res.body.specialization).toBe('Rehab');
    });

    it('updates own profile fields', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      const res = await request(server)
        .patch('/api/v1/trainers/me')
        .set(...bearer(trainer.accessToken))
        .send({ specialization: 'Olympic lifting', bio: 'Updated', phone: '+15550102' })
        .expect(200);

      expect(res.body.specialization).toBe('Olympic lifting');
      expect(res.body.account.phone).toBe('+15550102');
    });

    it.each(['firstName', 'hiredAt', 'status'])(
      'refuses to let a trainer change %s about themselves',
      async (field) => {
        const trainer = await seedTrainerProfile(ctx, server);

        await request(server)
          .patch('/api/v1/trainers/me')
          .set(...bearer(trainer.accessToken))
          .send({ [field]: 'anything' })
          .expect(400);
      },
    );

    it('lists own assigned members', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      await seedMemberProfile(ctx, server, {
        email: 'mine@gym.test',
        assignedTrainerId: trainer.trainerId,
      });
      await seedMemberProfile(ctx, server, { email: 'not-mine@gym.test' });

      const res = await request(server)
        .get('/api/v1/trainers/me/members')
        .set(...bearer(trainer.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].account.email).toBe('mine@gym.test');
    });

    it('reports a helpful 404 when the account has no trainer profile', async () => {
      const orphan = await seedAndLogin(ctx, server, { role: UserRole.TRAINER });

      const res = await request(server)
        .get('/api/v1/trainers/me')
        .set(...bearer(orphan.accessToken))
        .expect(404);

      expect(res.body.message).toMatch(/Trainer profile for the current account/);
    });
  });
});
