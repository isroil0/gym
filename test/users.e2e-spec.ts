import { UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import { TEST_PASSWORD, bearer, seedAndLogin, seedUser, type SignedInUser } from './utils/auth';

describe('Users administration (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;

  const newUser = {
    email: 'New.Trainer@Gym.TEST',
    password: 'TrainerPass1',
    role: UserRole.TRAINER,
    firstName: 'Tina',
    lastName: 'Trainer',
    phone: '+15550100',
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

  describe('POST /users', () => {
    it('creates an account and never echoes the password', async () => {
      const res = await request(server)
        .post('/api/v1/users')
        .set(...bearer(admin.accessToken))
        .send(newUser)
        .expect(201);

      expect(res.body.email).toBe('new.trainer@gym.test');
      expect(res.body.role).toBe(UserRole.TRAINER);
      expect(res.body.status).toBe(UserStatus.ACTIVE);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain(newUser.password);
    });

    it('creates an account that can immediately sign in', async () => {
      await request(server)
        .post('/api/v1/users')
        .set(...bearer(admin.accessToken))
        .send(newUser)
        .expect(201);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'new.trainer@gym.test', password: newUser.password })
        .expect(200);
    });

    it('rejects a duplicate email regardless of casing', async () => {
      await request(server)
        .post('/api/v1/users')
        .set(...bearer(admin.accessToken))
        .send(newUser)
        .expect(201);

      const res = await request(server)
        .post('/api/v1/users')
        .set(...bearer(admin.accessToken))
        .send({ ...newUser, email: 'NEW.TRAINER@gym.test' })
        .expect(409);

      expect(res.body.error).toBe('CONFLICT');
      expect(res.body.details).toEqual([{ field: 'email', messages: ['must be unique'] }]);
    });

    it('rejects an unknown role', async () => {
      const res = await request(server)
        .post('/api/v1/users')
        .set(...bearer(admin.accessToken))
        .send({ ...newUser, role: 'SUPERUSER' })
        .expect(400);

      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('rejects a weak password', async () => {
      await request(server)
        .post('/api/v1/users')
        .set(...bearer(admin.accessToken))
        .send({ ...newUser, password: 'weak' })
        .expect(400);
    });

    it('rejects an attempt to set the password hash directly', async () => {
      await request(server)
        .post('/api/v1/users')
        .set(...bearer(admin.accessToken))
        .send({ ...newUser, passwordHash: 'pre-computed' })
        .expect(400);
    });

    it('can create an account that starts out inactive', async () => {
      const res = await request(server)
        .post('/api/v1/users')
        .set(...bearer(admin.accessToken))
        .send({ ...newUser, status: UserStatus.INACTIVE })
        .expect(201);

      expect(res.body.status).toBe(UserStatus.INACTIVE);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'new.trainer@gym.test', password: newUser.password })
        .expect(403);
    });

    it('creates each of the three roles', async () => {
      for (const role of [UserRole.ADMIN, UserRole.TRAINER, UserRole.MEMBER]) {
        const res = await request(server)
          .post('/api/v1/users')
          .set(...bearer(admin.accessToken))
          .send({ ...newUser, email: `${role.toLowerCase()}@gym.test`, role })
          .expect(201);

        expect(res.body.role).toBe(role);
      }
    });
  });

  describe('GET /users', () => {
    beforeEach(async () => {
      await Promise.all([
        seedUser(ctx, { role: UserRole.TRAINER, email: 'tina@gym.test', firstName: 'Tina' }),
        seedUser(ctx, { role: UserRole.MEMBER, email: 'mia@gym.test', firstName: 'Mia' }),
        seedUser(ctx, {
          role: UserRole.MEMBER,
          email: 'max@gym.test',
          firstName: 'Max',
          status: UserStatus.INACTIVE,
        }),
      ]);
    });

    it('lists accounts with pagination metadata', async () => {
      const res = await request(server)
        .get('/api/v1/users')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.data).toHaveLength(4); // 3 seeded + the admin
      expect(res.body.meta).toEqual(
        expect.objectContaining({ page: 1, limit: 20, total: 4, totalPages: 1 }),
      );
      expect(res.body.data[0]).not.toHaveProperty('passwordHash');
    });

    it('filters by role', async () => {
      const res = await request(server)
        .get('/api/v1/users')
        .query({ role: UserRole.MEMBER })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(2);
      expect(res.body.data.every((u: { role: string }) => u.role === UserRole.MEMBER)).toBe(true);
    });

    it('filters by status', async () => {
      const res = await request(server)
        .get('/api/v1/users')
        .query({ status: UserStatus.INACTIVE })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].email).toBe('max@gym.test');
    });

    it('searches by name case-insensitively', async () => {
      const res = await request(server)
        .get('/api/v1/users')
        .query({ search: 'tIn' })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].email).toBe('tina@gym.test');
    });

    it('paginates', async () => {
      const res = await request(server)
        .get('/api/v1/users')
        .query({ page: 2, limit: 2 })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toEqual(
        expect.objectContaining({
          page: 2,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        }),
      );
    });

    it('rejects an out-of-range limit', async () => {
      await request(server)
        .get('/api/v1/users')
        .query({ limit: 500 })
        .set(...bearer(admin.accessToken))
        .expect(400);
    });
  });

  describe('GET /users/:id', () => {
    it('returns a single account', async () => {
      const { user } = await seedUser(ctx, { email: 'one@gym.test' });

      const res = await request(server)
        .get(`/api/v1/users/${user.id}`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.email).toBe('one@gym.test');
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(server)
        .get('/api/v1/users/0b5f8a2e-0000-4000-8000-000000000000')
        .set(...bearer(admin.accessToken))
        .expect(404);

      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('rejects a malformed id', async () => {
      await request(server)
        .get('/api/v1/users/not-a-uuid')
        .set(...bearer(admin.accessToken))
        .expect(400);
    });
  });

  describe('PATCH /users/:id/status', () => {
    it('deactivates and reactivates an account', async () => {
      const { user } = await seedUser(ctx, { email: 'toggle@gym.test' });

      const off = await request(server)
        .patch(`/api/v1/users/${user.id}/status`)
        .set(...bearer(admin.accessToken))
        .send({ status: UserStatus.INACTIVE })
        .expect(200);
      expect(off.body.status).toBe(UserStatus.INACTIVE);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'toggle@gym.test', password: TEST_PASSWORD })
        .expect(403);

      const on = await request(server)
        .patch(`/api/v1/users/${user.id}/status`)
        .set(...bearer(admin.accessToken))
        .send({ status: UserStatus.ACTIVE })
        .expect(200);
      expect(on.body.status).toBe(UserStatus.ACTIVE);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'toggle@gym.test', password: TEST_PASSWORD })
        .expect(200);
    });

    it('rejects an invalid status', async () => {
      const { user } = await seedUser(ctx);

      await request(server)
        .patch(`/api/v1/users/${user.id}/status`)
        .set(...bearer(admin.accessToken))
        .send({ status: 'ARCHIVED' })
        .expect(400);
    });

    it('returns 404 for an unknown account', async () => {
      await request(server)
        .patch('/api/v1/users/0b5f8a2e-0000-4000-8000-000000000000/status')
        .set(...bearer(admin.accessToken))
        .send({ status: UserStatus.INACTIVE })
        .expect(404);
    });
  });
});
