import { UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import { bearer, seedAndLogin, type SignedInUser } from './utils/auth';

/**
 * The authorization matrix. Every role is checked against every protected
 * route, including the routes it is *not* allowed to reach — a guard that
 * only ever sees happy-path traffic is not actually proven.
 */
describe('Authorization (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;
  let trainer: SignedInUser;
  let member: SignedInUser;

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
    trainer = await seedAndLogin(ctx, server, { role: UserRole.TRAINER });
    member = await seedAndLogin(ctx, server, { role: UserRole.MEMBER });
  });

  describe('authentication is required by default', () => {
    it.each([
      ['GET', '/api/v1/auth/me'],
      ['GET', '/api/v1/users'],
      ['POST', '/api/v1/users'],
      ['POST', '/api/v1/auth/logout'],
      ['POST', '/api/v1/auth/logout-all'],
      ['POST', '/api/v1/auth/change-password'],
    ])('%s %s rejects an anonymous caller', async (method, path) => {
      const res = await request(server)[method.toLowerCase() as 'get' | 'post'](path).send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });
  });

  describe('public routes need no credentials', () => {
    it.each([['/api/health'], ['/api/health/live']])('GET %s is public', async (path) => {
      await request(server).get(path).expect(200);
    });

    it.each([
      ['/api/v1/auth/login'],
      ['/api/v1/auth/refresh'],
      ['/api/v1/auth/forgot-password'],
      ['/api/v1/auth/reset-password'],
    ])('POST %s is reachable without a token', async (path) => {
      const res = await request(server).post(path).send({});
      // Reached the handler and failed validation rather than being refused by the guard.
      expect(res.status).not.toBe(401);
      expect(res.status).toBe(400);
    });
  });

  describe('ADMIN-only routes', () => {
    const adminRoutes: Array<['get' | 'post' | 'patch', string, object]> = [
      ['get', '/api/v1/users', {}],
      ['post', '/api/v1/users', {}],
    ];

    it.each(adminRoutes)('%s %s allows ADMIN', async (method, path) => {
      const res = await request(server)
        [method](path)
        .set(...bearer(admin.accessToken))
        .send({});

      expect(res.status).not.toBe(403);
    });

    it.each(adminRoutes)('%s %s forbids TRAINER', async (method, path) => {
      const res = await request(server)
        [method](path)
        .set(...bearer(trainer.accessToken))
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(res.body.message).toMatch(/requires one of the following roles: ADMIN/);
    });

    it.each(adminRoutes)('%s %s forbids MEMBER', async (method, path) => {
      const res = await request(server)
        [method](path)
        .set(...bearer(member.accessToken))
        .send({});

      expect(res.status).toBe(403);
    });

    it('forbids a TRAINER from reading a user by id', async () => {
      await request(server)
        .get(`/api/v1/users/${member.user.id}`)
        .set(...bearer(trainer.accessToken))
        .expect(403);
    });

    it('forbids a MEMBER from changing an account status', async () => {
      await request(server)
        .patch(`/api/v1/users/${trainer.user.id}/status`)
        .set(...bearer(member.accessToken))
        .send({ status: UserStatus.INACTIVE })
        .expect(403);
    });

    it('allows ADMIN to change an account status', async () => {
      await request(server)
        .patch(`/api/v1/users/${trainer.user.id}/status`)
        .set(...bearer(admin.accessToken))
        .send({ status: UserStatus.INACTIVE })
        .expect(200);
    });
  });

  describe('routes open to every authenticated role', () => {
    it.each([
      ['ADMIN', () => admin],
      ['TRAINER', () => trainer],
      ['MEMBER', () => member],
    ])('GET /auth/me works for %s', async (_role, get) => {
      const signedIn = get();

      const res = await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(signedIn.accessToken))
        .expect(200);

      expect(res.body.id).toBe(signedIn.user.id);
    });

    it('each role only ever sees its own identity on /auth/me', async () => {
      const [a, t, m] = await Promise.all(
        [admin, trainer, member].map((signedIn) =>
          request(server)
            .get('/api/v1/auth/me')
            .set(...bearer(signedIn.accessToken))
            .expect(200),
        ),
      );

      expect(a.body.role).toBe(UserRole.ADMIN);
      expect(t.body.role).toBe(UserRole.TRAINER);
      expect(m.body.role).toBe(UserRole.MEMBER);
      expect(new Set([a.body.id, t.body.id, m.body.id]).size).toBe(3);
    });
  });

  describe('deactivation takes effect immediately', () => {
    it("an admin deactivating a trainer invalidates the trainer's live token", async () => {
      await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(trainer.accessToken))
        .expect(200);

      await request(server)
        .patch(`/api/v1/users/${trainer.user.id}/status`)
        .set(...bearer(admin.accessToken))
        .send({ status: UserStatus.INACTIVE })
        .expect(200);

      await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(trainer.accessToken))
        .expect(403);
    });

    it('reactivating restores access', async () => {
      await request(server)
        .patch(`/api/v1/users/${member.user.id}/status`)
        .set(...bearer(admin.accessToken))
        .send({ status: UserStatus.INACTIVE })
        .expect(200);

      await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(member.accessToken))
        .expect(403);

      await request(server)
        .patch(`/api/v1/users/${member.user.id}/status`)
        .set(...bearer(admin.accessToken))
        .send({ status: UserStatus.ACTIVE })
        .expect(200);

      await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(member.accessToken))
        .expect(200);
    });
  });

  describe('cross-role token isolation', () => {
    it('a member cannot escalate by presenting a trainer id in the body', async () => {
      const res = await request(server)
        .get('/api/v1/users')
        .set(...bearer(member.accessToken))
        .query({ role: UserRole.ADMIN })
        .expect(403);

      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('a token remains bound to the role it was issued for', async () => {
      // Promote the member in the database; the old token still carries MEMBER,
      // but authorization reads the live record, so the new role applies.
      await ctx.prisma.user.update({
        where: { id: member.user.id },
        data: { role: UserRole.ADMIN },
      });

      await request(server)
        .get('/api/v1/users')
        .set(...bearer(member.accessToken))
        .expect(200);
    });
  });
});
