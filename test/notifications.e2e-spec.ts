import { MembershipStatus, NotificationType, UserRole } from '@prisma/client';
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

const dayOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('Notifications (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;

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

  const asAdmin = () => bearer(admin.accessToken);

  const announce = (body: Record<string, unknown>) =>
    request(server)
      .post('/api/v1/notifications/announcements')
      .set(...asAdmin())
      .send(body);

  describe('announcements', () => {
    it('reaches every active account with the given role', async () => {
      const a = await seedMemberProfile(ctx, server, { email: 'a@gym.test' });
      await seedMemberProfile(ctx, server, { email: 'b@gym.test' });
      await seedTrainerProfile(ctx, server, { email: 't@gym.test' });

      const res = await announce({
        title: 'Closed Sunday',
        body: 'The gym is shut all day Sunday.',
        roles: [UserRole.MEMBER],
        severity: 'WARNING',
      }).expect(201);

      expect(res.body.affected).toBe(2);

      const inbox = await request(server)
        .get('/api/v1/notifications')
        .set(...bearer(a.accessToken))
        .expect(200);

      expect(inbox.body.meta.total).toBe(1);
      expect(inbox.body.data[0]).toEqual(
        expect.objectContaining({
          type: NotificationType.ANNOUNCEMENT,
          title: 'Closed Sunday',
          severity: 'WARNING',
          read: false,
          readAt: null,
        }),
      );
    });

    it('does not reach the other roles', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      await seedMemberProfile(ctx, server);

      await announce({
        title: 'Members only',
        body: 'Details to follow.',
        roles: [UserRole.MEMBER],
      }).expect(201);

      const inbox = await request(server)
        .get('/api/v1/notifications')
        .set(...bearer(trainer.accessToken))
        .expect(200);
      expect(inbox.body.meta.total).toBe(0);
    });

    it('can target specific accounts', async () => {
      const a = await seedMemberProfile(ctx, server, { email: 'a@gym.test' });
      await seedMemberProfile(ctx, server, { email: 'b@gym.test' });

      const res = await announce({
        title: 'Just you',
        body: 'Details to follow.',
        userIds: [a.user.id],
      }).expect(201);

      expect(res.body.affected).toBe(1);
    });

    it('skips an inactive account', async () => {
      const member = await seedMemberProfile(ctx, server);
      await request(server)
        .patch(`/api/v1/users/${member.user.id}/status`)
        .set(...asAdmin())
        .send({ status: 'INACTIVE' })
        .expect(200);

      const res = await announce({
        title: 'Notice',
        body: 'Details to follow.',
        roles: [UserRole.MEMBER],
      }).expect(201);
      expect(res.body.affected).toBe(0);
    });

    it('requires either roles or specific accounts', async () => {
      await announce({ title: 'xx', body: 'Details to follow.' }).expect(400);
    });

    it('rejects an unknown role or severity', async () => {
      await announce({ title: 'x', body: 'Details to follow.', roles: ['WIZARD'] }).expect(400);
      await announce({
        title: 'x',
        body: 'Details to follow.',
        roles: [UserRole.MEMBER],
        severity: 'PANIC',
      }).expect(400);
    });

    it('can be sent twice, since an announcement may legitimately repeat', async () => {
      await seedMemberProfile(ctx, server);

      await announce({
        title: 'Reminder',
        body: 'Details to follow.',
        roles: [UserRole.MEMBER],
      }).expect(201);
      await announce({
        title: 'Reminder',
        body: 'Details to follow.',
        roles: [UserRole.MEMBER],
      }).expect(201);

      expect(await ctx.prisma.notification.count()).toBe(2);
    });
  });

  describe('the reminder sweep', () => {
    let member: Awaited<ReturnType<typeof seedMemberProfile>>;
    let plan: Awaited<ReturnType<typeof seedPlan>>;

    beforeEach(async () => {
      plan = await seedPlan(ctx, { name: 'Monthly Unlimited', price: '49.99' });
      member = await seedMemberProfile(ctx, server, { email: 'mia@gym.test' });
    });

    const run = (body: Record<string, unknown> = {}) =>
      request(server)
        .post('/api/v1/notifications/run-reminders')
        .set(...asAdmin())
        .send(body);

    it('warns a member whose membership is about to lapse', async () => {
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-20)),
        endDate: dayOf(isoDaysFromToday(3)),
      });

      const res = await run({ expiringWithinDays: 7 }).expect(200);
      expect(res.body.expiringMemberships).toBe(1);

      const inbox = await request(server)
        .get('/api/v1/notifications')
        .query({ type: NotificationType.MEMBERSHIP_EXPIRING })
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(inbox.body.meta.total).toBe(1);
      expect(inbox.body.data[0].title).toContain('4 days');
      expect(inbox.body.data[0].relatedEntityType).toBe('membership');
    });

    it('tells the assigned trainer too', async () => {
      const trainer = await seedTrainerProfile(ctx, server);
      await ctx.prisma.member.update({
        where: { id: member.memberId },
        data: { assignedTrainerId: trainer.trainerId },
      });
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-20)),
        endDate: dayOf(isoDaysFromToday(2)),
      });

      const res = await run({ expiringWithinDays: 7 }).expect(200);
      expect(res.body.expiringMemberships).toBe(2);

      const trainerInbox = await request(server)
        .get('/api/v1/notifications')
        .set(...bearer(trainer.accessToken))
        .expect(200);
      expect(trainerInbox.body.data[0].title).toContain('membership expires');
    });

    it('ignores a membership outside the window', async () => {
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(0)),
        endDate: dayOf(isoDaysFromToday(60)),
      });

      const res = await run({ expiringWithinDays: 7 }).expect(200);
      expect(res.body.expiringMemberships).toBe(0);
    });

    it('tells a member their membership has just run out', async () => {
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-31)),
        endDate: dayOf(isoDaysFromToday(-1)),
        status: MembershipStatus.EXPIRED,
      });

      const res = await run().expect(200);
      expect(res.body.expiredMemberships).toBe(1);

      const inbox = await request(server)
        .get('/api/v1/notifications')
        .query({ type: NotificationType.MEMBERSHIP_EXPIRED })
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(inbox.body.meta.total).toBe(1);
    });

    it('reminds a member who owes money, quoting the billing figure', async () => {
      await seedMembership(ctx, member.memberId, plan.id, { purchasePrice: '49.99' });

      const res = await run().expect(200);
      expect(res.body.paymentReminders).toBe(1);

      const inbox = await request(server)
        .get('/api/v1/notifications')
        .query({ type: NotificationType.PAYMENT_DUE })
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(inbox.body.data[0].title).toContain('49.99');

      const report = await request(server)
        .get('/api/v1/reports/unpaid-balances')
        .set(...asAdmin())
        .expect(200);
      expect(inbox.body.data[0].title).toContain(report.body.balances[0].outstanding);
    });

    it('does not remind a member who has paid', async () => {
      const membership = await seedMembership(ctx, member.memberId, plan.id, {
        purchasePrice: '49.99',
      });
      await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({
          memberId: member.memberId,
          membershipId: membership.id,
          amount: 49.99,
          method: 'CASH',
        })
        .expect(201);

      const res = await run().expect(200);
      expect(res.body.paymentReminders).toBe(0);
    });

    it('honours a minimum balance', async () => {
      await seedMembership(ctx, member.memberId, plan.id, { purchasePrice: '5.00' });

      const res = await run({ minimumBalance: 50 }).expect(200);
      expect(res.body.paymentReminders).toBe(0);
    });

    it('is idempotent: a second run on the same day creates nothing', async () => {
      await seedMembership(ctx, member.memberId, plan.id, {
        startDate: dayOf(isoDaysFromToday(-20)),
        endDate: dayOf(isoDaysFromToday(3)),
        purchasePrice: '49.99',
      });

      const first = await run({ expiringWithinDays: 7 }).expect(200);
      expect(first.body.expiringMemberships + first.body.paymentReminders).toBe(2);
      expect(first.body.skippedAsDuplicate).toBe(0);

      const second = await run({ expiringWithinDays: 7 }).expect(200);
      expect(second.body.expiringMemberships).toBe(0);
      expect(second.body.paymentReminders).toBe(0);
      expect(second.body.skippedAsDuplicate).toBe(2);

      expect(await ctx.prisma.notification.count()).toBe(2);
    });

    it('sends a fresh payment reminder once the balance changes', async () => {
      const membership = await seedMembership(ctx, member.memberId, plan.id, {
        purchasePrice: '49.99',
      });

      await run().expect(200);
      await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({
          memberId: member.memberId,
          membershipId: membership.id,
          amount: 20,
          method: 'CASH',
        })
        .expect(201);

      const second = await run().expect(200);
      expect(second.body.paymentReminders).toBe(1);
    });

    it('rejects an out-of-range window', async () => {
      await run({ expiringWithinDays: 0 }).expect(400);
      await run({ expiringWithinDays: 500 }).expect(400);
    });

    it('is ADMIN only', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      await request(server)
        .post('/api/v1/notifications/run-reminders')
        .set(...bearer(trainer.accessToken))
        .send({})
        .expect(403);
      await request(server)
        .post('/api/v1/notifications/run-reminders')
        .set(...bearer(member.accessToken))
        .send({})
        .expect(403);
    });
  });

  describe('reading and dismissing', () => {
    let member: Awaited<ReturnType<typeof seedMemberProfile>>;
    let other: Awaited<ReturnType<typeof seedMemberProfile>>;

    beforeEach(async () => {
      member = await seedMemberProfile(ctx, server, { email: 'mine@gym.test' });
      other = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });
      await announce({
        title: 'Hello',
        body: 'Details to follow.',
        roles: [UserRole.MEMBER],
      }).expect(201);
    });

    const ownNotificationId = async (): Promise<string> => {
      const inbox = await request(server)
        .get('/api/v1/notifications')
        .set(...bearer(member.accessToken))
        .expect(200);
      return inbox.body.data[0].id as string;
    };

    it('counts unread, then marks one read', async () => {
      const before = await request(server)
        .get('/api/v1/notifications/unread-count')
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(before.body.unread).toBe(1);

      const id = await ownNotificationId();
      const read = await request(server)
        .post(`/api/v1/notifications/${id}/read`)
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(read.body.read).toBe(true);
      expect(read.body.readAt).not.toBeNull();

      const after = await request(server)
        .get('/api/v1/notifications/unread-count')
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(after.body.unread).toBe(0);
    });

    it('marking read twice is harmless', async () => {
      const id = await ownNotificationId();

      await request(server)
        .post(`/api/v1/notifications/${id}/read`)
        .set(...bearer(member.accessToken))
        .expect(200);
      await request(server)
        .post(`/api/v1/notifications/${id}/read`)
        .set(...bearer(member.accessToken))
        .expect(200);
    });

    it('marks everything read at once', async () => {
      await announce({
        title: 'Second',
        body: 'Details to follow.',
        roles: [UserRole.MEMBER],
      }).expect(201);

      const res = await request(server)
        .post('/api/v1/notifications/read-all')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.affected).toBe(2);

      const count = await request(server)
        .get('/api/v1/notifications/unread-count')
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(count.body.unread).toBe(0);
    });

    it('marking all read affects nobody else', async () => {
      await request(server)
        .post('/api/v1/notifications/read-all')
        .set(...bearer(member.accessToken))
        .expect(200);

      const theirs = await request(server)
        .get('/api/v1/notifications/unread-count')
        .set(...bearer(other.accessToken))
        .expect(200);
      expect(theirs.body.unread).toBe(1);
    });

    it('filters by read state and type', async () => {
      const id = await ownNotificationId();
      await request(server)
        .post(`/api/v1/notifications/${id}/read`)
        .set(...bearer(member.accessToken))
        .expect(200);

      const unread = await request(server)
        .get('/api/v1/notifications')
        .query({ unread: true })
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(unread.body.meta.total).toBe(0);

      const read = await request(server)
        .get('/api/v1/notifications')
        .query({ unread: false })
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(read.body.meta.total).toBe(1);

      const byType = await request(server)
        .get('/api/v1/notifications')
        .query({ type: NotificationType.PAYMENT_DUE })
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(byType.body.meta.total).toBe(0);
    });

    it('dismisses own notification', async () => {
      const id = await ownNotificationId();

      await request(server)
        .delete(`/api/v1/notifications/${id}`)
        .set(...bearer(member.accessToken))
        .expect(204);

      const inbox = await request(server)
        .get('/api/v1/notifications')
        .set(...bearer(member.accessToken))
        .expect(200);
      expect(inbox.body.meta.total).toBe(0);
    });
  });

  describe("nobody can reach another user's notifications", () => {
    let member: Awaited<ReturnType<typeof seedMemberProfile>>;
    let other: Awaited<ReturnType<typeof seedMemberProfile>>;
    let victimNotificationId: string;

    beforeEach(async () => {
      member = await seedMemberProfile(ctx, server, { email: 'victim@gym.test' });
      other = await seedMemberProfile(ctx, server, { email: 'attacker@gym.test' });
      await announce({
        title: 'Private',
        body: 'Details to follow.',
        userIds: [member.user.id],
      }).expect(201);

      const inbox = await request(server)
        .get('/api/v1/notifications')
        .set(...bearer(member.accessToken))
        .expect(200);
      victimNotificationId = inbox.body.data[0].id as string;
    });

    it('another member sees nothing of it', async () => {
      const inbox = await request(server)
        .get('/api/v1/notifications')
        .set(...bearer(other.accessToken))
        .expect(200);
      expect(inbox.body.meta.total).toBe(0);
    });

    it.each([
      ['another member', () => other.accessToken],
      ['an administrator', () => admin.accessToken],
    ])('%s cannot mark it read', async (_label, token) => {
      await request(server)
        .post(`/api/v1/notifications/${victimNotificationId}/read`)
        .set(...bearer(token()))
        .expect(404);
    });

    it.each([
      ['another member', () => other.accessToken],
      ['an administrator', () => admin.accessToken],
    ])('%s cannot dismiss it', async (_label, token) => {
      await request(server)
        .delete(`/api/v1/notifications/${victimNotificationId}`)
        .set(...bearer(token()))
        .expect(404);
    });

    it('is still there afterwards', async () => {
      await request(server)
        .delete(`/api/v1/notifications/${victimNotificationId}`)
        .set(...bearer(other.accessToken))
        .expect(404);

      expect(await ctx.prisma.notification.count()).toBe(1);
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/notifications').expect(401);
      await request(server).get('/api/v1/notifications/unread-count').expect(401);
    });
  });
});
