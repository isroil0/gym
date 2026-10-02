import {
  CheckInMethod,
  MembershipStatus,
  ProfileStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
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

/** The reason code the API returns in `details` when entry is refused. */
function denialReason(body: { details?: Array<{ field: string; messages: string[] }> }): string {
  return body.details?.[0]?.messages[0] ?? '';
}

describe('Attendance (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;
  let member: Awaited<ReturnType<typeof seedMemberProfile>>;
  let unlimitedPlan: Awaited<ReturnType<typeof seedPlan>>;

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
    member = await seedMemberProfile(ctx, server, { email: 'mia@gym.test' });
    unlimitedPlan = await seedPlan(ctx, { name: 'Unlimited', visitLimit: null });
    await seedMembership(ctx, member.memberId, unlimitedPlan.id);
  });

  const asAdmin = () => bearer(admin.accessToken);

  const checkIn = (memberId = member.memberId, notes?: string) =>
    request(server)
      .post('/api/v1/attendance/check-in')
      .set(...asAdmin())
      .send({ memberId, ...(notes ? { notes } : {}) });

  const checkOut = (memberId = member.memberId) =>
    request(server)
      .post('/api/v1/attendance/check-out')
      .set(...asAdmin())
      .send({ memberId });

  describe('manual check-in', () => {
    it('admits an active member on an active membership', async () => {
      const res = await checkIn(member.memberId, 'Walk-in').expect(201);

      expect(res.body.admitted).toBe(true);
      expect(res.body.attendance.method).toBe(CheckInMethod.MANUAL);
      expect(res.body.attendance.stillInside).toBe(true);
      expect(res.body.attendance.checkedOutAt).toBeNull();
      expect(res.body.attendance.durationMinutes).toBeNull();
      expect(res.body.attendance.memberCode).toMatch(/^M-\d{6}$/);
      expect(res.body.attendance.notes).toBe('Walk-in');
      expect(res.body.attendance.recordedBy).toBeTruthy();
      expect(res.body.visitsRemaining).toBeNull();
      expect(res.body.membershipDaysRemaining).toBeGreaterThan(0);
    });

    it('links the visit to the membership that admitted it', async () => {
      const res = await checkIn().expect(201);

      const stored = await ctx.prisma.attendance.findUniqueOrThrow({
        where: { id: res.body.attendance.id },
      });
      expect(stored.membershipId).not.toBeNull();
      expect(res.body.attendance.membershipPlanName).toBe('Unlimited');
    });

    it('refuses a second check-in while the member is inside', async () => {
      await checkIn().expect(201);

      const res = await checkIn().expect(422);
      expect(denialReason(res.body)).toBe('ALREADY_INSIDE');
      expect(await ctx.prisma.attendance.count()).toBe(1);
    });

    it('allows re-entry after checking out', async () => {
      await checkIn().expect(201);
      await checkOut().expect(200);
      await checkIn().expect(201);

      expect(await ctx.prisma.attendance.count()).toBe(2);
    });

    it('rejects an unknown member', async () => {
      await checkIn('0b5f8a2e-0000-4000-8000-000000000000').expect(404);
    });

    it('rejects a malformed member id', async () => {
      await request(server)
        .post('/api/v1/attendance/check-in')
        .set(...asAdmin())
        .send({ memberId: 'not-a-uuid' })
        .expect(400);
    });
  });

  describe('membership gating', () => {
    async function replaceMembership(
      status: MembershipStatus,
      extra: Record<string, unknown> = {},
    ) {
      await ctx.prisma.attendance.deleteMany({ where: { memberId: member.memberId } });
      await ctx.prisma.memberMembership.deleteMany({ where: { memberId: member.memberId } });
      await seedMembership(ctx, member.memberId, unlimitedPlan.id, { status, ...extra });
    }

    it('refuses a member with no membership at all', async () => {
      await ctx.prisma.memberMembership.deleteMany({ where: { memberId: member.memberId } });

      const res = await checkIn().expect(422);
      expect(denialReason(res.body)).toBe('NO_MEMBERSHIP');
    });

    it('refuses a frozen membership', async () => {
      await replaceMembership(MembershipStatus.FROZEN, { frozenAt: new Date() });

      const res = await checkIn().expect(422);
      expect(denialReason(res.body)).toBe('MEMBERSHIP_FROZEN');
    });

    it('refuses an expired membership', async () => {
      await replaceMembership(MembershipStatus.EXPIRED, {
        startDate: new Date(`${isoDaysFromToday(-60)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-30)}T00:00:00.000Z`),
      });

      const res = await checkIn().expect(422);
      expect(denialReason(res.body)).toBe('MEMBERSHIP_EXPIRED');
    });

    it('refuses a membership that has not started', async () => {
      await replaceMembership(MembershipStatus.PENDING, {
        startDate: new Date(`${isoDaysFromToday(10)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(40)}T00:00:00.000Z`),
      });

      const res = await checkIn().expect(422);
      expect(denialReason(res.body)).toBe('MEMBERSHIP_NOT_STARTED');
    });

    it('refuses a cancelled membership', async () => {
      await replaceMembership(MembershipStatus.CANCELLED);

      const res = await checkIn().expect(422);
      expect(denialReason(res.body)).toBe('MEMBERSHIP_CANCELLED');
    });

    it('refuses an archived member', async () => {
      await ctx.prisma.member.update({
        where: { id: member.memberId },
        data: { status: ProfileStatus.ARCHIVED },
      });

      const res = await checkIn().expect(422);
      expect(denialReason(res.body)).toBe('MEMBER_ARCHIVED');
    });

    it('refuses a member whose account was deactivated', async () => {
      await ctx.prisma.user.update({
        where: { id: member.user.id },
        data: { status: UserStatus.INACTIVE },
      });

      const res = await checkIn().expect(422);
      expect(denialReason(res.body)).toBe('ACCOUNT_INACTIVE');
    });

    it('expires a stale membership on the way in rather than admitting them', async () => {
      // Stored ACTIVE but the end date has passed: the entry check reconciles.
      await replaceMembership(MembershipStatus.ACTIVE, {
        startDate: new Date(`${isoDaysFromToday(-60)}T00:00:00.000Z`),
        endDate: new Date(`${isoDaysFromToday(-1)}T00:00:00.000Z`),
      });

      const res = await checkIn().expect(422);
      expect(denialReason(res.body)).toBe('MEMBERSHIP_EXPIRED');
    });
  });

  describe('limited visit allowance', () => {
    let packMember: Awaited<ReturnType<typeof seedMemberProfile>>;
    let membershipId: string;

    beforeEach(async () => {
      const plan = await seedPlan(ctx, { name: 'Three Pack', visitLimit: 3 });
      packMember = await seedMemberProfile(ctx, server, { email: 'pack@gym.test' });
      const membership = await seedMembership(ctx, packMember.memberId, plan.id, {
        visitLimit: 3,
        visitsUsed: 0,
      });
      membershipId = membership.id;
    });

    it('deducts one visit per entry and reports what is left', async () => {
      const first = await checkIn(packMember.memberId).expect(201);
      expect(first.body.visitsRemaining).toBe(2);
      expect(first.body.attendance.visitDeducted).toBe(true);

      await checkOut(packMember.memberId).expect(200);

      const second = await checkIn(packMember.memberId).expect(201);
      expect(second.body.visitsRemaining).toBe(1);

      const stored = await ctx.prisma.memberMembership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      expect(stored.visitsUsed).toBe(2);
    });

    it('admits the final visit then refuses the next', async () => {
      for (let i = 0; i < 3; i += 1) {
        await checkIn(packMember.memberId).expect(201);
        await checkOut(packMember.memberId).expect(200);
      }

      const res = await checkIn(packMember.memberId).expect(422);
      expect(denialReason(res.body)).toBe('NO_VISITS_LEFT');

      const stored = await ctx.prisma.memberMembership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      expect(stored.visitsUsed).toBe(3);
    });

    it('does not consume a visit when entry is refused', async () => {
      await ctx.prisma.memberMembership.update({
        where: { id: membershipId },
        data: { status: MembershipStatus.FROZEN, frozenAt: new Date() },
      });

      await checkIn(packMember.memberId).expect(422);

      const stored = await ctx.prisma.memberMembership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      expect(stored.visitsUsed).toBe(0);
    });

    it('does not consume a visit on a refused double check-in', async () => {
      await checkIn(packMember.memberId).expect(201);
      await checkIn(packMember.memberId).expect(422);

      const stored = await ctx.prisma.memberMembership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      expect(stored.visitsUsed).toBe(1);
    });

    it('does not deduct from an unlimited membership', async () => {
      const res = await checkIn().expect(201);

      expect(res.body.attendance.visitDeducted).toBe(false);
      expect(res.body.visitsRemaining).toBeNull();
    });
  });

  describe('the database prevents a double check-in', () => {
    it('rejects a second open visit even when inserted directly', async () => {
      await checkIn().expect(201);

      // The partial unique index, not the application check, is what makes
      // this impossible under a race.
      await expect(
        ctx.prisma.attendance.create({
          data: { memberId: member.memberId, method: CheckInMethod.MANUAL },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('allows many closed visits for the same member', async () => {
      for (let i = 0; i < 3; i += 1) {
        await checkIn().expect(201);
        await checkOut().expect(200);
      }

      expect(await ctx.prisma.attendance.count({ where: { memberId: member.memberId } })).toBe(3);
    });
  });

  describe('check-out', () => {
    it('closes the visit and records a duration', async () => {
      const opened = await checkIn().expect(201);
      await ctx.prisma.attendance.update({
        where: { id: opened.body.attendance.id },
        data: { checkedInAt: new Date(Date.now() - 90 * 60_000) },
      });

      const res = await checkOut().expect(200);

      expect(res.body.stillInside).toBe(false);
      expect(res.body.checkedOutAt).not.toBeNull();
      expect(res.body.durationMinutes).toBeGreaterThanOrEqual(89);
    });

    it('refuses when the member is not inside', async () => {
      const res = await checkOut().expect(409);
      expect(res.body.message).toMatch(/not currently checked in/);
    });

    it('refuses to close the same visit twice by id', async () => {
      const opened = await checkIn().expect(201);

      await request(server)
        .post(`/api/v1/attendance/${opened.body.attendance.id}/check-out`)
        .set(...asAdmin())
        .expect(200);
      await request(server)
        .post(`/api/v1/attendance/${opened.body.attendance.id}/check-out`)
        .set(...asAdmin())
        .expect(409);
    });

    it('does not give a visit back on check-out', async () => {
      const plan = await seedPlan(ctx, { name: 'Pack', visitLimit: 5 });
      const packMember = await seedMemberProfile(ctx, server, { email: 'p@gym.test' });
      const membership = await seedMembership(ctx, packMember.memberId, plan.id, {
        visitLimit: 5,
      });

      await checkIn(packMember.memberId).expect(201);
      await checkOut(packMember.memberId).expect(200);

      const stored = await ctx.prisma.memberMembership.findUniqueOrThrow({
        where: { id: membership.id },
      });
      expect(stored.visitsUsed).toBe(1);
    });
  });

  describe("today's attendance", () => {
    it('counts the visits started today and who is still inside', async () => {
      const other = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });
      await seedMembership(ctx, other.memberId, unlimitedPlan.id);

      await checkIn().expect(201);
      await checkIn(other.memberId).expect(201);
      await checkOut(other.memberId).expect(200);

      const res = await request(server)
        .get('/api/v1/attendance/today')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.date).toBe(isoDaysFromToday(0));
      expect(res.body.totalVisits).toBe(2);
      expect(res.body.currentlyInside).toBe(1);
      expect(res.body.visits).toHaveLength(2);
    });

    it('excludes visits from earlier days', async () => {
      const opened = await checkIn().expect(201);
      await ctx.prisma.attendance.update({
        where: { id: opened.body.attendance.id },
        data: {
          checkedInAt: new Date(`${isoDaysFromToday(-3)}T10:00:00.000Z`),
          checkedOutAt: new Date(`${isoDaysFromToday(-3)}T11:00:00.000Z`),
        },
      });

      const res = await request(server)
        .get('/api/v1/attendance/today')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.totalVisits).toBe(0);
    });
  });

  describe('history', () => {
    beforeEach(async () => {
      await checkIn().expect(201);
      await checkOut().expect(200);
    });

    it('lists visits for an administrator', async () => {
      const res = await request(server)
        .get('/api/v1/attendance')
        .set(...asAdmin())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
    });

    it('filters by member, method and date range', async () => {
      const byMember = await request(server)
        .get('/api/v1/attendance')
        .query({ memberId: member.memberId })
        .set(...asAdmin())
        .expect(200);
      expect(byMember.body.meta.total).toBe(1);

      const byMethod = await request(server)
        .get('/api/v1/attendance')
        .query({ method: CheckInMethod.QR })
        .set(...asAdmin())
        .expect(200);
      expect(byMethod.body.meta.total).toBe(0);

      const inRange = await request(server)
        .get('/api/v1/attendance')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);
      expect(inRange.body.meta.total).toBe(1);

      const outOfRange = await request(server)
        .get('/api/v1/attendance')
        .query({ from: isoDaysFromToday(-10), to: isoDaysFromToday(-5) })
        .set(...asAdmin())
        .expect(200);
      expect(outOfRange.body.meta.total).toBe(0);
    });

    it('gives a member their own history without staff notes', async () => {
      await checkIn(member.memberId, 'Looked unwell').expect(201);

      const res = await request(server)
        .get('/api/v1/attendance/me')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(2);
      expect(res.body.data[0]).not.toHaveProperty('notes');
      expect(JSON.stringify(res.body)).not.toContain('Looked unwell');
    });
  });

  describe('authorization', () => {
    it("a trainer sees only their assigned members' visits", async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const assigned = await seedMemberProfile(ctx, server, {
        email: 'assigned@gym.test',
        assignedTrainerId: trainer.trainerId,
      });
      await seedMembership(ctx, assigned.memberId, unlimitedPlan.id);

      await checkIn().expect(201);
      const theirs = await checkIn(assigned.memberId).expect(201);

      const res = await request(server)
        .get('/api/v1/attendance')
        .set(...bearer(trainer.accessToken))
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].id).toBe(theirs.body.attendance.id);
    });

    it("a trainer gets 404 for an unassigned member's visit", async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      const mine = await checkIn().expect(201);

      await request(server)
        .get(`/api/v1/attendance/${mine.body.attendance.id}`)
        .set(...bearer(trainer.accessToken))
        .expect(404);
    });

    it("a member cannot read another member's visit", async () => {
      const other = await seedMemberProfile(ctx, server, { email: 'nosy@gym.test' });
      await seedMembership(ctx, other.memberId, unlimitedPlan.id);
      const theirs = await checkIn(other.memberId).expect(201);

      await request(server)
        .get(`/api/v1/attendance/${theirs.body.attendance.id}`)
        .set(...bearer(member.accessToken))
        .expect(404);
    });

    it.each([
      ['/api/v1/attendance/check-in', { memberId: '0b5f8a2e-0000-4000-8000-000000000000' }],
      ['/api/v1/attendance/check-in/qr', { token: 'GYM1.a.1.b' }],
      ['/api/v1/attendance/check-out', { memberId: '0b5f8a2e-0000-4000-8000-000000000000' }],
    ])('POST %s is ADMIN only', async (path, body) => {
      const trainer = await seedTrainerProfile(ctx, server);

      for (const token of [trainer.accessToken, member.accessToken]) {
        const res = await request(server)
          .post(path)
          .set(...bearer(token))
          .send(body);
        expect(res.status).toBe(403);
      }
    });

    it("today's attendance is ADMIN only", async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      await request(server)
        .get('/api/v1/attendance/today')
        .set(...bearer(trainer.accessToken))
        .expect(403);
      await request(server)
        .get('/api/v1/attendance/today')
        .set(...bearer(member.accessToken))
        .expect(403);
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/attendance').expect(401);
      await request(server).post('/api/v1/attendance/check-in').send({}).expect(401);
    });
  });
});
