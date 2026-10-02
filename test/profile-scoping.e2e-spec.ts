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

/**
 * "A trainer can only access assigned members; an admin can access all."
 *
 * This suite exists to prove the negative half of that sentence: it is mostly
 * about what each role *cannot* reach, including attempts to widen scope
 * through query parameters and attempts to probe ids directly.
 */
describe('Profile scoping and IDOR (e2e)', () => {
  let ctx: TestContext;
  let server: App;

  let admin: SignedInUser;
  let tina: Awaited<ReturnType<typeof seedTrainerProfile>>;
  let sam: Awaited<ReturnType<typeof seedTrainerProfile>>;
  let tinasMember: Awaited<ReturnType<typeof seedMemberProfile>>;
  let samsMember: Awaited<ReturnType<typeof seedMemberProfile>>;
  let unassignedMember: Awaited<ReturnType<typeof seedMemberProfile>>;

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

    tinasMember = await seedMemberProfile(ctx, server, {
      email: 'tinas@gym.test',
      assignedTrainerId: tina.trainerId,
      notes: 'tina notes',
    });
    samsMember = await seedMemberProfile(ctx, server, {
      email: 'sams@gym.test',
      assignedTrainerId: sam.trainerId,
    });
    unassignedMember = await seedMemberProfile(ctx, server, { email: 'free@gym.test' });
  });

  describe('admin reaches everything', () => {
    it('lists every member regardless of assignment', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(3);
    });

    it.each([
      ["tina's member", () => tinasMember],
      ["sam's member", () => samsMember],
      ['an unassigned member', () => unassignedMember],
    ])('reads %s', async (_label, get) => {
      await request(server)
        .get(`/api/v1/members/${get().memberId}`)
        .set(...bearer(admin.accessToken))
        .expect(200);
    });
  });

  describe('a trainer is confined to their own members', () => {
    it('lists only assigned members', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .set(...bearer(tina.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].account.email).toBe('tinas@gym.test');
    });

    it('reads an assigned member', async () => {
      await request(server)
        .get(`/api/v1/members/${tinasMember.memberId}`)
        .set(...bearer(tina.accessToken))
        .expect(200);
    });

    it("gets 404, not 403, for another trainer's member", async () => {
      const res = await request(server)
        .get(`/api/v1/members/${samsMember.memberId}`)
        .set(...bearer(tina.accessToken))
        .expect(404);

      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('gets 404 for an unassigned member', async () => {
      await request(server)
        .get(`/api/v1/members/${unassignedMember.memberId}`)
        .set(...bearer(tina.accessToken))
        .expect(404);
    });

    it('cannot tell a real out-of-scope id from a nonexistent one', async () => {
      const outOfScope = await request(server)
        .get(`/api/v1/members/${samsMember.memberId}`)
        .set(...bearer(tina.accessToken))
        .expect(404);

      const nonexistent = await request(server)
        .get('/api/v1/members/0b5f8a2e-0000-4000-8000-000000000000')
        .set(...bearer(tina.accessToken))
        .expect(404);

      expect(outOfScope.body.error).toBe(nonexistent.body.error);
      expect(outOfScope.body.statusCode).toBe(nonexistent.body.statusCode);
    });

    it('cannot widen scope by filtering on another trainer', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .query({ assignedTrainerId: sam.trainerId })
        .set(...bearer(tina.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].account.email).toBe('tinas@gym.test');
    });

    it('cannot reach unassigned members through the unassigned filter', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .query({ unassigned: true })
        .set(...bearer(tina.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });

    it("cannot find another trainer's member by searching", async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .query({ search: 'sams@gym.test' })
        .set(...bearer(tina.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });

    it('sees nobody once their members are reassigned away', async () => {
      await request(server)
        .patch(`/api/v1/members/${tinasMember.memberId}/trainer`)
        .set(...bearer(admin.accessToken))
        .send({ trainerId: sam.trainerId })
        .expect(200);

      const res = await request(server)
        .get('/api/v1/members')
        .set(...bearer(tina.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(0);

      await request(server)
        .get(`/api/v1/members/${tinasMember.memberId}`)
        .set(...bearer(tina.accessToken))
        .expect(404);
    });

    it('sees a newly assigned member immediately', async () => {
      await request(server)
        .patch(`/api/v1/members/${unassignedMember.memberId}/trainer`)
        .set(...bearer(admin.accessToken))
        .send({ trainerId: tina.trainerId })
        .expect(200);

      const res = await request(server)
        .get('/api/v1/members')
        .set(...bearer(tina.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(2);
    });

    it('fails closed when the trainer account has no profile yet', async () => {
      const orphan = await seedAndLogin(ctx, server, { role: UserRole.TRAINER });

      const res = await request(server)
        .get('/api/v1/members')
        .set(...bearer(orphan.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });

    it("cannot edit even an assigned member's profile", async () => {
      await request(server)
        .patch(`/api/v1/members/${tinasMember.memberId}`)
        .set(...bearer(tina.accessToken))
        .send({ address: 'changed by trainer' })
        .expect(403);
    });

    it.each([
      ['archive', (id: string) => `/api/v1/members/${id}/archive`],
      ['reactivate', (id: string) => `/api/v1/members/${id}/reactivate`],
    ])('cannot %s a member', async (_label, path) => {
      await request(server)
        .post(path(tinasMember.memberId))
        .set(...bearer(tina.accessToken))
        .expect(403);
    });

    it('cannot reassign a member to themselves', async () => {
      await request(server)
        .patch(`/api/v1/members/${unassignedMember.memberId}/trainer`)
        .set(...bearer(tina.accessToken))
        .send({ trainerId: tina.trainerId })
        .expect(403);
    });

    it('cannot create members or trainers', async () => {
      await request(server)
        .post('/api/v1/members')
        .set(...bearer(tina.accessToken))
        .send({ email: 'x@gym.test', password: 'MemberPass1', firstName: 'X', lastName: 'Y' })
        .expect(403);

      await request(server)
        .post('/api/v1/trainers')
        .set(...bearer(tina.accessToken))
        .send({ email: 'y@gym.test', password: 'TrainerPass1', firstName: 'X', lastName: 'Y' })
        .expect(403);
    });

    it("cannot browse the trainer roster or another trainer's members", async () => {
      await request(server)
        .get('/api/v1/trainers')
        .set(...bearer(tina.accessToken))
        .expect(403);

      await request(server)
        .get(`/api/v1/trainers/${sam.trainerId}`)
        .set(...bearer(tina.accessToken))
        .expect(403);

      await request(server)
        .get(`/api/v1/trainers/${sam.trainerId}/members`)
        .set(...bearer(tina.accessToken))
        .expect(403);
    });
  });

  describe('a member reaches only themselves', () => {
    it('cannot list members', async () => {
      await request(server)
        .get('/api/v1/members')
        .set(...bearer(tinasMember.accessToken))
        .expect(403);
    });

    it('cannot read another member by id', async () => {
      await request(server)
        .get(`/api/v1/members/${samsMember.memberId}`)
        .set(...bearer(tinasMember.accessToken))
        .expect(403);
    });

    it('cannot read its own record through the staff route either', async () => {
      await request(server)
        .get(`/api/v1/members/${tinasMember.memberId}`)
        .set(...bearer(tinasMember.accessToken))
        .expect(403);
    });

    it('reads itself through /members/me', async () => {
      const res = await request(server)
        .get('/api/v1/members/me')
        .set(...bearer(tinasMember.accessToken))
        .expect(200);

      expect(res.body.id).toBe(tinasMember.memberId);
    });

    it('cannot edit another member', async () => {
      await request(server)
        .patch(`/api/v1/members/${samsMember.memberId}`)
        .set(...bearer(tinasMember.accessToken))
        .send({ address: 'hacked' })
        .expect(403);
    });

    it('cannot assign itself a trainer', async () => {
      await request(server)
        .patch(`/api/v1/members/${tinasMember.memberId}/trainer`)
        .set(...bearer(tinasMember.accessToken))
        .send({ trainerId: sam.trainerId })
        .expect(403);
    });

    it('cannot reach any trainer route', async () => {
      await request(server)
        .get('/api/v1/trainers')
        .set(...bearer(tinasMember.accessToken))
        .expect(403);

      await request(server)
        .get('/api/v1/trainers/me')
        .set(...bearer(tinasMember.accessToken))
        .expect(403);
    });
  });

  describe('anonymous callers', () => {
    it.each([
      ['GET', '/api/v1/members'],
      ['GET', '/api/v1/members/me'],
      ['GET', '/api/v1/trainers'],
      ['GET', '/api/v1/trainers/me'],
    ])('%s %s requires a token', async (_method, path) => {
      const res = await request(server).get(path);
      expect(res.status).toBe(401);
    });
  });
});
