import { Gender, ProfileStatus, UserRole, UserStatus } from '@prisma/client';
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

describe('Members (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;

  const newMember = {
    email: 'Mia.Member@Gym.TEST',
    password: 'MemberPass1',
    firstName: ' Mia ',
    lastName: ' Member ',
    phone: '+15550100',
    gender: Gender.FEMALE,
    dateOfBirth: '1995-04-17',
    address: '12 Queen Street',
    emergencyContactName: 'Jane Member',
    emergencyContactPhone: '+15550199',
    notes: 'Prefers morning sessions',
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

  describe('POST /members', () => {
    it('creates the account and the profile together', async () => {
      const res = await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send(newMember)
        .expect(201);

      expect(res.body.memberCode).toMatch(/^M-\d{6}$/);
      expect(res.body.account.email).toBe('mia.member@gym.test');
      expect(res.body.account.firstName).toBe('Mia');
      expect(res.body.status).toBe(ProfileStatus.ACTIVE);
      expect(res.body.gender).toBe(Gender.FEMALE);
      expect(res.body.assignedTrainer).toBeNull();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain(newMember.password);
    });

    it('creates an account with role MEMBER that can sign in', async () => {
      await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send(newMember)
        .expect(201);

      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'mia.member@gym.test', password: newMember.password })
        .expect(200);

      expect(login.body.user.role).toBe(UserRole.MEMBER);
    });

    it('issues sequential member codes', async () => {
      const first = await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send(newMember)
        .expect(201);

      const second = await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send({ ...newMember, email: 'second@gym.test' })
        .expect(201);

      expect(second.body.memberCode).not.toBe(first.body.memberCode);
    });

    it('links an existing MEMBER account', async () => {
      const { user } = await seedUser(ctx, { role: UserRole.MEMBER, email: 'orphan@gym.test' });

      const res = await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send({ userId: user.id })
        .expect(201);

      expect(res.body.account.id).toBe(user.id);
      expect(res.body.account.email).toBe('orphan@gym.test');
    });

    it('refuses to link an account of the wrong role', async () => {
      const { user } = await seedUser(ctx, { role: UserRole.TRAINER });

      const res = await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send({ userId: user.id })
        .expect(422);

      expect(res.body.message).toMatch(/requires role MEMBER/);
    });

    it('refuses to link an account that already has a profile', async () => {
      const seeded = await seedMemberProfile(ctx, server);

      await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send({ userId: seeded.user.id })
        .expect(409);
    });

    it('rolls the account back when profile creation fails', async () => {
      const before = await ctx.prisma.user.count();

      await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send({ ...newMember, assignedTrainerId: '0b5f8a2e-0000-4000-8000-000000000000' })
        .expect(404);

      expect(await ctx.prisma.user.count()).toBe(before);
      expect(
        await ctx.prisma.user.findUnique({ where: { email: 'mia.member@gym.test' } }),
      ).toBeNull();
    });

    it('rejects a duplicate email', async () => {
      await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send(newMember)
        .expect(201);

      await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send(newMember)
        .expect(409);
    });

    it('requires account details when no userId is given', async () => {
      const res = await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send({ gender: Gender.MALE })
        .expect(400);

      expect((res.body.details as Array<{ field: string }>).map((d) => d.field)).toEqual(
        expect.arrayContaining(['email', 'password', 'firstName', 'lastName']),
      );
    });

    it('can assign a trainer at creation time', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      const res = await request(server)
        .post('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .send({ ...newMember, assignedTrainerId: trainer.trainerId })
        .expect(201);

      expect(res.body.assignedTrainer.id).toBe(trainer.trainerId);
      expect(res.body.assignedAt).not.toBeNull();
    });
  });

  describe('GET /members', () => {
    beforeEach(async () => {
      const trainer = await seedTrainerProfile(ctx, server, { email: 'tina@gym.test' });
      await seedMemberProfile(ctx, server, {
        email: 'alice@gym.test',
        firstName: 'Alice',
        assignedTrainerId: trainer.trainerId,
      });
      await seedMemberProfile(ctx, server, { email: 'bob@gym.test', firstName: 'Bob' });
      await seedMemberProfile(ctx, server, {
        email: 'carol@gym.test',
        firstName: 'Carol',
        status: ProfileStatus.ARCHIVED,
      });
    });

    it('lists every member for an administrator', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(3);
      expect(res.body.data[0].memberCode).toMatch(/^M-\d{6}$/);
    });

    it('filters by status', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .query({ status: ProfileStatus.ARCHIVED })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].account.email).toBe('carol@gym.test');
    });

    it('filters members without a trainer', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .query({ unassigned: true })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(2);
    });

    it('filters members with a trainer', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .query({ unassigned: false })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].account.email).toBe('alice@gym.test');
    });

    it('searches by name', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .query({ search: 'ali' })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
    });

    it('searches by member code', async () => {
      const listed = await request(server)
        .get('/api/v1/members')
        .set(...bearer(admin.accessToken))
        .expect(200);
      const code = listed.body.data[0].memberCode as string;

      const res = await request(server)
        .get('/api/v1/members')
        .query({ search: code })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].memberCode).toBe(code);
    });

    it('paginates', async () => {
      const res = await request(server)
        .get('/api/v1/members')
        .query({ page: 2, limit: 2 })
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toEqual(
        expect.objectContaining({ page: 2, totalPages: 2, hasPreviousPage: true }),
      );
    });

    it('rejects an invalid unassigned value', async () => {
      await request(server)
        .get('/api/v1/members')
        .query({ unassigned: 'maybe' })
        .set(...bearer(admin.accessToken))
        .expect(400);
    });
  });

  describe('PATCH /members/:id', () => {
    it('updates both profile and account fields', async () => {
      const member = await seedMemberProfile(ctx, server);

      const res = await request(server)
        .patch(`/api/v1/members/${member.memberId}`)
        .set(...bearer(admin.accessToken))
        .send({ firstName: 'Renamed', phone: '+15551234', gender: Gender.OTHER, notes: 'updated' })
        .expect(200);

      expect(res.body.account.firstName).toBe('Renamed');
      expect(res.body.account.phone).toBe('+15551234');
      expect(res.body.gender).toBe(Gender.OTHER);
      expect(res.body.notes).toBe('updated');
    });

    it('leaves unspecified fields untouched', async () => {
      const member = await seedMemberProfile(ctx, server, { notes: 'keep me' });

      const res = await request(server)
        .patch(`/api/v1/members/${member.memberId}`)
        .set(...bearer(admin.accessToken))
        .send({ address: 'New address' })
        .expect(200);

      expect(res.body.notes).toBe('keep me');
      expect(res.body.address).toBe('New address');
    });

    it('rejects unknown properties', async () => {
      const member = await seedMemberProfile(ctx, server);

      await request(server)
        .patch(`/api/v1/members/${member.memberId}`)
        .set(...bearer(admin.accessToken))
        .send({ status: ProfileStatus.ARCHIVED })
        .expect(400);
    });

    it('returns 404 for an unknown member', async () => {
      await request(server)
        .patch('/api/v1/members/0b5f8a2e-0000-4000-8000-000000000000')
        .set(...bearer(admin.accessToken))
        .send({ address: 'nowhere' })
        .expect(404);
    });
  });

  describe('trainer assignment', () => {
    it('assigns and unassigns a trainer', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const member = await seedMemberProfile(ctx, server);

      const assigned = await request(server)
        .patch(`/api/v1/members/${member.memberId}/trainer`)
        .set(...bearer(admin.accessToken))
        .send({ trainerId: trainer.trainerId })
        .expect(200);

      expect(assigned.body.assignedTrainer.id).toBe(trainer.trainerId);
      expect(assigned.body.assignedAt).not.toBeNull();

      const unassigned = await request(server)
        .patch(`/api/v1/members/${member.memberId}/trainer`)
        .set(...bearer(admin.accessToken))
        .send({ trainerId: null })
        .expect(200);

      expect(unassigned.body.assignedTrainer).toBeNull();
      expect(unassigned.body.assignedAt).toBeNull();
    });

    it('rejects an unknown trainer', async () => {
      const member = await seedMemberProfile(ctx, server);

      await request(server)
        .patch(`/api/v1/members/${member.memberId}/trainer`)
        .set(...bearer(admin.accessToken))
        .send({ trainerId: '0b5f8a2e-0000-4000-8000-000000000000' })
        .expect(404);
    });

    it('refuses an archived trainer', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const member = await seedMemberProfile(ctx, server);
      await request(server)
        .post(`/api/v1/trainers/${trainer.trainerId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      const res = await request(server)
        .patch(`/api/v1/members/${member.memberId}/trainer`)
        .set(...bearer(admin.accessToken))
        .send({ trainerId: trainer.trainerId })
        .expect(422);

      expect(res.body.message).toMatch(/archived and cannot take on members/);
    });

    it('refuses to assign a trainer to an archived member', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const member = await seedMemberProfile(ctx, server, { status: ProfileStatus.ARCHIVED });

      await request(server)
        .patch(`/api/v1/members/${member.memberId}/trainer`)
        .set(...bearer(admin.accessToken))
        .send({ trainerId: trainer.trainerId })
        .expect(422);
    });
  });

  describe('archive / reactivate', () => {
    it('archives a member and locks the account out', async () => {
      const member = await seedMemberProfile(ctx, server, { email: 'leaving@gym.test' });

      const res = await request(server)
        .post(`/api/v1/members/${member.memberId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.status).toBe(ProfileStatus.ARCHIVED);
      expect(res.body.archivedAt).not.toBeNull();
      expect(res.body.account.status).toBe(UserStatus.INACTIVE);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'leaving@gym.test', password: TEST_PASSWORD })
        .expect(403);
    });

    it("revokes the archived member's sessions", async () => {
      const member = await seedMemberProfile(ctx, server);

      await request(server)
        .post(`/api/v1/members/${member.memberId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      // The refresh token is revoked outright, so this is a dead credential
      // (401) rather than an active credential on a disabled account (403).
      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: member.refreshToken })
        .expect(401);

      expect(res.body.message).toMatch(/revoked/);

      // The access token is rejected too, on the live account status.
      await request(server)
        .get('/api/v1/members/me')
        .set(...bearer(member.accessToken))
        .expect(403);
    });

    it('keeps the profile and its history', async () => {
      const member = await seedMemberProfile(ctx, server, { notes: 'history preserved' });

      await request(server)
        .post(`/api/v1/members/${member.memberId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      const res = await request(server)
        .get(`/api/v1/members/${member.memberId}`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.notes).toBe('history preserved');
    });

    it('refuses to archive twice', async () => {
      const member = await seedMemberProfile(ctx, server);

      await request(server)
        .post(`/api/v1/members/${member.memberId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      await request(server)
        .post(`/api/v1/members/${member.memberId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(409);
    });

    it('reactivates and restores login', async () => {
      const member = await seedMemberProfile(ctx, server, { email: 'returning@gym.test' });

      await request(server)
        .post(`/api/v1/members/${member.memberId}/archive`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      const res = await request(server)
        .post(`/api/v1/members/${member.memberId}/reactivate`)
        .set(...bearer(admin.accessToken))
        .expect(200);

      expect(res.body.status).toBe(ProfileStatus.ACTIVE);
      expect(res.body.archivedAt).toBeNull();
      expect(res.body.account.status).toBe(UserStatus.ACTIVE);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'returning@gym.test', password: TEST_PASSWORD })
        .expect(200);
    });

    it('refuses to reactivate an active member', async () => {
      const member = await seedMemberProfile(ctx, server);

      await request(server)
        .post(`/api/v1/members/${member.memberId}/reactivate`)
        .set(...bearer(admin.accessToken))
        .expect(409);
    });
  });

  describe('member self-service', () => {
    it("returns the member's own profile without staff notes", async () => {
      const trainer = await seedTrainerProfile(ctx, server, { firstName: 'Tina' });
      const member = await seedMemberProfile(ctx, server, {
        notes: 'internal only',
        assignedTrainerId: trainer.trainerId,
      });

      const res = await request(server)
        .get('/api/v1/members/me')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.id).toBe(member.memberId);
      expect(res.body).not.toHaveProperty('notes');
      expect(JSON.stringify(res.body)).not.toContain('internal only');
      expect(res.body.assignedTrainer.firstName).toBe('Tina');
    });

    it('updates own contact details', async () => {
      const member = await seedMemberProfile(ctx, server);

      const res = await request(server)
        .patch('/api/v1/members/me')
        .set(...bearer(member.accessToken))
        .send({ phone: '+15559999', address: 'New place', emergencyContactName: 'Kin' })
        .expect(200);

      expect(res.body.account.phone).toBe('+15559999');
      expect(res.body.address).toBe('New place');
      expect(res.body.emergencyContactName).toBe('Kin');
    });

    it.each(['notes', 'firstName', 'status', 'assignedTrainerId'])(
      'refuses to let a member change %s',
      async (field) => {
        const member = await seedMemberProfile(ctx, server);

        await request(server)
          .patch('/api/v1/members/me')
          .set(...bearer(member.accessToken))
          .send({ [field]: 'anything' })
          .expect(400);
      },
    );

    it('reports a helpful 404 when the account has no member profile', async () => {
      const orphan = await seedAndLogin(ctx, server, { role: UserRole.MEMBER });

      const res = await request(server)
        .get('/api/v1/members/me')
        .set(...bearer(orphan.accessToken))
        .expect(404);

      expect(res.body.message).toMatch(/Member profile for the current account/);
    });
  });
});
