import { UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import { TEST_PASSWORD, bearer, seedAndLogin, seedUser } from './utils/auth';

describe('Auth (e2e)', () => {
  let ctx: TestContext;
  let server: App;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
  });

  describe('POST /auth/login', () => {
    it('returns a token pair and the user, without the password hash', async () => {
      const { user } = await seedUser(ctx, { email: 'member@gym.test', role: UserRole.MEMBER });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'member@gym.test', password: TEST_PASSWORD })
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({ tokenType: 'Bearer', expiresIn: expect.any(Number) }),
      );
      expect(res.body.accessToken.split('.')).toHaveLength(3);
      expect(res.body.refreshToken).toHaveLength(96);
      expect(res.body.user.id).toBe(user.id);
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain(TEST_PASSWORD);
    });

    it('accepts the email in any casing', async () => {
      await seedUser(ctx, { email: 'mixed@gym.test' });

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: '  MiXeD@Gym.TEST ', password: TEST_PASSWORD })
        .expect(200);
    });

    it('records the login timestamp', async () => {
      const { user } = await seedUser(ctx, { email: 'stamp@gym.test' });
      expect(user.lastLoginAt).toBeNull();

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'stamp@gym.test', password: TEST_PASSWORD })
        .expect(200);

      const reloaded = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(reloaded.lastLoginAt).toBeInstanceOf(Date);
    });

    it('reports a wrong password and an unknown email identically', async () => {
      await seedUser(ctx, { email: 'real@gym.test' });

      const wrongPassword = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'real@gym.test', password: 'WrongPass123' })
        .expect(401);

      const unknownEmail = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@gym.test', password: 'WrongPass123' })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
      expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
    });

    it('refuses an inactive account', async () => {
      await seedUser(ctx, { email: 'off@gym.test', status: UserStatus.INACTIVE });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'off@gym.test', password: TEST_PASSWORD })
        .expect(403);

      expect(res.body.message).toMatch(/account is inactive/);
    });

    it('validates the payload', async () => {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: '' })
        .expect(400);

      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect((res.body.details as Array<{ field: string }>).map((d) => d.field)).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });

    it('rejects unknown properties in the payload', async () => {
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'a@gym.test', password: 'x', role: 'ADMIN' })
        .expect(400);
    });

    it('stores only a hash of the refresh token', async () => {
      await seedUser(ctx, { email: 'hashed@gym.test' });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'hashed@gym.test', password: TEST_PASSWORD })
        .expect(200);

      const stored = await ctx.prisma.refreshToken.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0].tokenHash).not.toBe(res.body.refreshToken);
      expect(stored[0].tokenHash).toHaveLength(64);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the signed-in user', async () => {
      const signedIn = await seedAndLogin(ctx, server, { role: UserRole.TRAINER });

      const res = await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(signedIn.accessToken))
        .expect(200);

      expect(res.body.id).toBe(signedIn.user.id);
      expect(res.body.role).toBe(UserRole.TRAINER);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('rejects an anonymous request', async () => {
      const res = await request(server).get('/api/v1/auth/me').expect(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('rejects a malformed Authorization header', async () => {
      await request(server).get('/api/v1/auth/me').set('Authorization', 'Basic abc123').expect(401);
    });

    it('rejects a tampered token', async () => {
      const signedIn = await seedAndLogin(ctx, server);
      const tampered = `${signedIn.accessToken.slice(0, -4)}AAAA`;

      await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(tampered))
        .expect(401);
    });

    it('rejects a token for an account deactivated after it was issued', async () => {
      const signedIn = await seedAndLogin(ctx, server);
      await ctx.prisma.user.update({
        where: { id: signedIn.user.id },
        data: { status: UserStatus.INACTIVE },
      });

      const res = await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(signedIn.accessToken))
        .expect(403);

      expect(res.body.message).toMatch(/account is inactive/);
    });

    it('rejects a token for a deleted account', async () => {
      const signedIn = await seedAndLogin(ctx, server);
      await ctx.prisma.user.delete({ where: { id: signedIn.user.id } });

      await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(signedIn.accessToken))
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and returns a new pair', async () => {
      const signedIn = await seedAndLogin(ctx, server);

      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(200);

      expect(res.body.refreshToken).not.toBe(signedIn.refreshToken);
      expect(res.body.accessToken).toBeDefined();

      const tokens = await ctx.prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } });
      expect(tokens).toHaveLength(2);
      expect(tokens[0].revokedAt).toBeInstanceOf(Date);
      expect(tokens[0].replacedById).toBe(tokens[1].id);
      expect(tokens[1].revokedAt).toBeNull();
    });

    it('issues a usable access token', async () => {
      const signedIn = await seedAndLogin(ctx, server);

      const refreshed = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(200);

      await request(server)
        .get('/api/v1/auth/me')
        .set(...bearer(refreshed.body.accessToken))
        .expect(200);
    });

    it('rejects an unknown refresh token', async () => {
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'a'.repeat(96) })
        .expect(401);
    });

    it('rejects an expired refresh token', async () => {
      const signedIn = await seedAndLogin(ctx, server);
      await ctx.prisma.refreshToken.updateMany({
        where: { userId: signedIn.user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(401);

      expect(res.body.message).toMatch(/expired/);
    });

    it('treats replay of a rotated token as theft and kills every session', async () => {
      const signedIn = await seedAndLogin(ctx, server);

      const rotated = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(200);

      // Replay the original, already-rotated token.
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(401);

      // The legitimate successor is revoked too.
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);

      const live = await ctx.prisma.refreshToken.count({
        where: { userId: signedIn.user.id, revokedAt: null },
      });
      expect(live).toBe(0);
    });

    it('rejects a refresh token for an account deactivated mid-session', async () => {
      const signedIn = await seedAndLogin(ctx, server);
      await ctx.prisma.user.update({
        where: { id: signedIn.user.id },
        data: { status: UserStatus.INACTIVE },
      });

      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(403);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the presented session only', async () => {
      const signedIn = await seedAndLogin(ctx, server);
      const second = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: signedIn.user.email, password: signedIn.password })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/logout')
        .set(...bearer(signedIn.accessToken))
        .send({ refreshToken: signedIn.refreshToken })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(401);

      // The other session is untouched: logging out of one device must not
      // sign the user out everywhere.
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: second.body.refreshToken })
        .expect(200);
    });

    it('retrying a refresh after logout does not end the other sessions', async () => {
      const signedIn = await seedAndLogin(ctx, server);
      const second = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: signedIn.user.email, password: signedIn.password })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/logout')
        .set(...bearer(signedIn.accessToken))
        .send({ refreshToken: signedIn.refreshToken })
        .expect(200);

      // A stale client on the logged-out device retries twice.
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(401);
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(401);

      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: second.body.refreshToken })
        .expect(200);
    });

    it('requires authentication', async () => {
      await request(server)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'anything' })
        .expect(401);
    });

    it("refuses to revoke another user's refresh token", async () => {
      const victim = await seedAndLogin(ctx, server);
      const attacker = await seedAndLogin(ctx, server);

      await request(server)
        .post('/api/v1/auth/logout')
        .set(...bearer(attacker.accessToken))
        .send({ refreshToken: victim.refreshToken })
        .expect(403);

      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: victim.refreshToken })
        .expect(200);
    });

    it('logout-all revokes every session', async () => {
      const signedIn = await seedAndLogin(ctx, server);
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: signedIn.user.email, password: signedIn.password })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/logout-all')
        .set(...bearer(signedIn.accessToken))
        .expect(200);

      const live = await ctx.prisma.refreshToken.count({
        where: { userId: signedIn.user.id, revokedAt: null },
      });
      expect(live).toBe(0);
    });
  });

  describe('POST /auth/change-password', () => {
    it('changes the password and signs every session out', async () => {
      const signedIn = await seedAndLogin(ctx, server);

      await request(server)
        .post('/api/v1/auth/change-password')
        .set(...bearer(signedIn.accessToken))
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'BrandNewPass9' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: signedIn.user.email, password: TEST_PASSWORD })
        .expect(401);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: signedIn.user.email, password: 'BrandNewPass9' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(401);
    });

    it('rejects a wrong current password', async () => {
      const signedIn = await seedAndLogin(ctx, server);

      await request(server)
        .post('/api/v1/auth/change-password')
        .set(...bearer(signedIn.accessToken))
        .send({ currentPassword: 'NotMyPass1', newPassword: 'BrandNewPass9' })
        .expect(401);
    });

    it('rejects a new password that does not meet the policy', async () => {
      const signedIn = await seedAndLogin(ctx, server);

      const res = await request(server)
        .post('/api/v1/auth/change-password')
        .set(...bearer(signedIn.accessToken))
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'weak' })
        .expect(400);

      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('rejects reusing the current password', async () => {
      const signedIn = await seedAndLogin(ctx, server);

      await request(server)
        .post('/api/v1/auth/change-password')
        .set(...bearer(signedIn.accessToken))
        .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })
        .expect(400);
    });

    it('requires authentication', async () => {
      await request(server)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'a', newPassword: 'BrandNewPass9' })
        .expect(401);
    });
  });

  describe('forgot / reset password', () => {
    it('completes the full reset flow and signs every session out', async () => {
      const signedIn = await seedAndLogin(ctx, server, { email: 'reset@gym.test' });

      const forgot = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'reset@gym.test' })
        .expect(200);

      expect(forgot.body.resetToken).toBeDefined();

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: forgot.body.resetToken, newPassword: 'AfterReset12' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'reset@gym.test', password: 'AfterReset12' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signedIn.refreshToken })
        .expect(401);
    });

    it('stores only a hash of the reset token', async () => {
      await seedUser(ctx, { email: 'hash-reset@gym.test' });

      const forgot = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'hash-reset@gym.test' })
        .expect(200);

      const stored = await ctx.prisma.passwordResetToken.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0].tokenHash).not.toBe(forgot.body.resetToken);
    });

    it('answers identically for an unregistered address', async () => {
      await seedUser(ctx, { email: 'known@gym.test' });

      const known = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'known@gym.test' })
        .expect(200);

      const unknown = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'unknown@gym.test' })
        .expect(200);

      expect(unknown.body.message).toBe(known.body.message);
      expect(unknown.body.resetToken).toBeUndefined();
      expect(await ctx.prisma.passwordResetToken.count()).toBe(1);
    });

    it('supersedes an earlier outstanding request', async () => {
      await seedUser(ctx, { email: 'twice@gym.test' });

      const first = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'twice@gym.test' })
        .expect(200);

      const second = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'twice@gym.test' })
        .expect(200);

      expect(await ctx.prisma.passwordResetToken.count()).toBe(1);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: first.body.resetToken, newPassword: 'ShouldFail12' })
        .expect(401);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: second.body.resetToken, newPassword: 'ShouldWork12' })
        .expect(200);
    });

    it('makes the reset token single use', async () => {
      await seedUser(ctx, { email: 'once@gym.test' });
      const forgot = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'once@gym.test' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: forgot.body.resetToken, newPassword: 'FirstReset12' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: forgot.body.resetToken, newPassword: 'SecondReset1' })
        .expect(401);
    });

    it('rejects an expired reset token', async () => {
      await seedUser(ctx, { email: 'stale@gym.test' });
      const forgot = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'stale@gym.test' })
        .expect(200);

      await ctx.prisma.passwordResetToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: forgot.body.resetToken, newPassword: 'TooLate1234' })
        .expect(401);

      expect(res.body.message).toMatch(/expired/);
    });

    it('rejects an unknown reset token', async () => {
      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'b'.repeat(64), newPassword: 'Whatever123' })
        .expect(401);
    });

    it('enforces the password policy on reset', async () => {
      await seedUser(ctx, { email: 'policy@gym.test' });
      const forgot = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'policy@gym.test' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: forgot.body.resetToken, newPassword: 'weak' })
        .expect(400);
    });

    it('issues nothing for an inactive account', async () => {
      await seedUser(ctx, { email: 'inactive@gym.test', status: UserStatus.INACTIVE });

      const res = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'inactive@gym.test' })
        .expect(200);

      expect(res.body.resetToken).toBeUndefined();
      expect(await ctx.prisma.passwordResetToken.count()).toBe(0);
    });
  });
});
