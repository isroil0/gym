import { NotificationSeverity, NotificationType, UserRole, UserStatus } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GymTimeService } from '../../common/time/gym-time.service';
import type { BillingService } from '../payments/billing.service';
import type { MembershipsService } from '../memberships/memberships.service';

const TODAY = '2026-10-15';

function gymTime(): GymTimeService {
  return {
    zone: 'UTC',
    today: () => TODAY,
    localDateOf: (instant: Date) => instant.toISOString().slice(0, 10),
    localDateAsUtcMidnight: (localDate: string) => new Date(`${localDate}T00:00:00.000Z`),
    shift: (localDate: string, days: number) =>
      new Date(new Date(`${localDate}T00:00:00.000Z`).getTime() + days * 86_400_000)
        .toISOString()
        .slice(0, 10),
  } as unknown as GymTimeService;
}

describe('NotificationsService', () => {
  let prisma: {
    notification: {
      createMany: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { findMany: jest.Mock };
    member: { findMany: jest.Mock };
    memberMembership: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let billing: { outstanding: jest.Mock };
  let memberships: { syncOverdue: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      notification: {
        createMany: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown[] }) =>
            Promise.resolve({ count: data.length }),
          ),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      member: { findMany: jest.fn().mockResolvedValue([]) },
      memberMembership: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };
    billing = { outstanding: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }) };
    memberships = { syncOverdue: jest.fn().mockResolvedValue({ expired: 0, activated: 0 }) };

    service = new NotificationsService(
      prisma as unknown as PrismaService,
      gymTime(),
      billing as unknown as BillingService,
      memberships as unknown as MembershipsService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('announcements', () => {
    it('delivers to every active account with the given roles', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      await service.announce({
        title: 'Closed Sunday',
        body: 'Shut all day.',
        roles: [UserRole.MEMBER],
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: [UserRole.MEMBER] }, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      expect(prisma.notification.createMany.mock.calls[0][0].data).toHaveLength(2);
    });

    it('prefers explicit recipients over roles', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);

      await service.announce({
        title: 'Hi',
        body: 'There',
        roles: [UserRole.MEMBER],
        userIds: ['u9'],
      });

      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        id: { in: ['u9'] },
        status: UserStatus.ACTIVE,
      });
    });

    it('carries no dedupe key, so the same announcement can be sent again', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);

      await service.announce({ title: 'Hi', body: 'There', roles: [UserRole.MEMBER] });

      const [draft] = prisma.notification.createMany.mock.calls[0][0].data as Array<{
        dedupeKey: string | null;
      }>;
      expect(draft.dedupeKey).toBeNull();
    });

    it('writes nothing when nobody matches', async () => {
      await service.announce({ title: 'Hi', body: 'There', roles: [UserRole.ADMIN] });
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('reminder sweep', () => {
    const membership = {
      id: 'mm-1',
      endDate: new Date('2026-10-18T00:00:00.000Z'),
      status: 'ACTIVE' as const,
      plan: { name: 'Monthly Unlimited' },
      member: {
        userId: 'member-user',
        user: { firstName: 'Mia', lastName: 'Member' },
        assignedTrainer: null,
      },
    };

    it('reconciles membership statuses before deciding what to send', async () => {
      await service.runReminders({ expiringWithinDays: 7 });
      expect(memberships.syncOverdue).toHaveBeenCalled();
    });

    it('warns the member about a membership about to lapse', async () => {
      prisma.memberMembership.findMany.mockResolvedValueOnce([membership]).mockResolvedValue([]);

      await service.runReminders({ expiringWithinDays: 7 }, new Date(`${TODAY}T12:00:00.000Z`));

      const drafts = prisma.notification.createMany.mock.calls[0][0].data as Array<{
        recipientId: string;
        type: NotificationType;
        dedupeKey: string;
      }>;
      expect(drafts[0].recipientId).toBe('member-user');
      expect(drafts[0].type).toBe(NotificationType.MEMBERSHIP_EXPIRING);
      // Keyed to the membership and the day, so a second sweep is a no-op.
      expect(drafts[0].dedupeKey).toBe(`membership-expiring:mm-1:${TODAY}`);
    });

    it('tells the assigned trainer as well, since they have the conversation', async () => {
      prisma.memberMembership.findMany
        .mockResolvedValueOnce([
          {
            ...membership,
            member: { ...membership.member, assignedTrainer: { userId: 'trainer-user' } },
          },
        ])
        .mockResolvedValue([]);

      await service.runReminders({ expiringWithinDays: 7 }, new Date(`${TODAY}T12:00:00.000Z`));

      const drafts = prisma.notification.createMany.mock.calls[0][0].data as Array<{
        recipientId: string;
      }>;
      expect(drafts.map((draft) => draft.recipientId)).toEqual(['member-user', 'trainer-user']);
    });

    it('raises the severity when a membership is nearly out', async () => {
      prisma.memberMembership.findMany
        .mockResolvedValueOnce([{ ...membership, endDate: new Date(`${TODAY}T00:00:00.000Z`) }])
        .mockResolvedValue([]);

      await service.runReminders({ expiringWithinDays: 7 }, new Date(`${TODAY}T12:00:00.000Z`));

      const [draft] = prisma.notification.createMany.mock.calls[0][0].data as Array<{
        severity: NotificationSeverity;
      }>;
      expect(draft.severity).toBe(NotificationSeverity.WARNING);
    });

    it('reports the duplicates the database skipped', async () => {
      prisma.memberMembership.findMany.mockResolvedValueOnce([membership]).mockResolvedValue([]);
      // The unique index rejected the row, so fewer were created than offered.
      prisma.notification.createMany.mockResolvedValue({ count: 0 });

      const result = await service.runReminders(
        { expiringWithinDays: 7 },
        new Date(`${TODAY}T12:00:00.000Z`),
      );

      expect(result.expiringMemberships).toBe(0);
      expect(result.skippedAsDuplicate).toBe(1);
    });

    it('relies on the database to deduplicate, not on a prior read', async () => {
      prisma.memberMembership.findMany.mockResolvedValueOnce([membership]).mockResolvedValue([]);

      await service.runReminders({ expiringWithinDays: 7 }, new Date(`${TODAY}T12:00:00.000Z`));

      // Two concurrent sweeps would both see "nothing sent yet"; skipDuplicates
      // is what actually prevents the double send.
      expect(prisma.notification.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    });

    it('quotes the balance from the billing service, not a recomputation', async () => {
      billing.outstanding.mockResolvedValue({
        data: [{ memberId: 'member-1', outstanding: '49.97' }],
        meta: { total: 1 },
      });
      prisma.member.findMany.mockResolvedValue([{ id: 'member-1', userId: 'member-user' }]);

      await service.runReminders({ expiringWithinDays: 7 }, new Date(`${TODAY}T12:00:00.000Z`));

      const paymentCall = prisma.notification.createMany.mock.calls.at(-1)![0].data as Array<{
        title: string;
        type: NotificationType;
        dedupeKey: string;
      }>;
      expect(paymentCall[0].type).toBe(NotificationType.PAYMENT_DUE);
      expect(paymentCall[0].title).toContain('49.97');
      // The amount is in the key, so a changed balance warrants a fresh nudge.
      expect(paymentCall[0].dedupeKey).toContain('49.97');
    });

    it('skips a debtor whose member record cannot be resolved', async () => {
      billing.outstanding.mockResolvedValue({
        data: [{ memberId: 'ghost', outstanding: '10.00' }],
        meta: { total: 1 },
      });
      prisma.member.findMany.mockResolvedValue([]);

      const result = await service.runReminders({ expiringWithinDays: 7 });
      expect(result.paymentReminders).toBe(0);
    });
  });

  describe('per-user scoping', () => {
    it('filters the list by recipient', async () => {
      await service.findForUser('user-1', { page: 1, limit: 20, skip: 0, take: 20 });

      const filters = prisma.notification.findMany.mock.calls[0][0].where.AND as unknown[];
      expect(filters[0]).toEqual({ recipientId: 'user-1' });
    });

    it('scopes marking read by recipient in the lookup, not afterwards', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('user-1', 'n-9')).rejects.toMatchObject({
        errorCode: 'NOT_FOUND',
      });
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'n-9', recipientId: 'user-1' },
      });
    });

    it('is idempotent when already read', async () => {
      const alreadyRead = { id: 'n-1', readAt: new Date() };
      prisma.notification.findFirst.mockResolvedValue(alreadyRead);

      await expect(service.markRead('user-1', 'n-1')).resolves.toBe(alreadyRead);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it("deletes only the caller's own notification", async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove('user-1', 'n-9')).rejects.toMatchObject({
        errorCode: 'NOT_FOUND',
      });
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { id: 'n-9', recipientId: 'user-1' },
      });
    });

    it('marks all read for one user only', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 4 });

      await expect(service.markAllRead('user-1')).resolves.toBe(4);
      expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
        recipientId: 'user-1',
        readAt: null,
      });
    });
  });
});
