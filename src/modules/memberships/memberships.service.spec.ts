import { MembershipStatus, Prisma, ProfileStatus, UserRole, UserStatus } from '@prisma/client';
import { MembershipsService } from './memberships.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MembersService } from '../members/members.service';
import type { MembershipPlansService } from './membership-plans.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { QueryMembershipsDto } from './dto/membership.dto';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function principal(role: UserRole): AuthenticatedUser {
  return { id: 'user-1', email: 'a@gym.test', role, status: UserStatus.ACTIVE };
}

function query(overrides: Partial<QueryMembershipsDto> = {}): QueryMembershipsDto {
  return { page: 1, limit: 20, skip: 0, take: 20, ...overrides };
}

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    name: 'Monthly Unlimited',
    durationDays: 30,
    price: new Prisma.Decimal('49.99'),
    visitLimit: null,
    ...overrides,
  };
}

/**
 * A membership whose window contains today, for the cases that must reach the
 * business rules rather than being expired first by the status sync.
 */
function makeCurrentMembership(overrides: Record<string, unknown> = {}) {
  return makeMembership({
    startDate: new Date(Date.now() - 5 * 86_400_000),
    endDate: new Date(Date.now() + 25 * 86_400_000),
    ...overrides,
  });
}

function makeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mm-1',
    memberId: 'member-1',
    planId: 'plan-1',
    purchasePrice: new Prisma.Decimal('49.99'),
    visitLimit: null,
    visitsUsed: 0,
    startDate: d('2026-01-01'),
    endDate: d('2026-01-30'),
    status: MembershipStatus.ACTIVE,
    frozenAt: null,
    totalFrozenDays: 0,
    cancelledAt: null,
    cancellationReason: null,
    extendedDays: 0,
    previousMembershipId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    plan: makePlan(),
    ...overrides,
  };
}

describe('MembershipsService', () => {
  let prisma: {
    memberMembership: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    membershipFreeze: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let members: { findOneOrFail: jest.Mock; scopeFor: jest.Mock };
  let plans: { findSellableOrFail: jest.Mock };
  let service: MembershipsService;

  beforeEach(() => {
    prisma = {
      memberMembership: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      membershipFreeze: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.resolve([{ count: 0 }, { count: 0 }]),
    );

    members = {
      findOneOrFail: jest.fn().mockResolvedValue({ id: 'member-1', status: ProfileStatus.ACTIVE }),
      scopeFor: jest.fn().mockResolvedValue({ assignedTrainerId: 'trainer-1' }),
    };
    plans = { findSellableOrFail: jest.fn().mockResolvedValue(makePlan()) };

    service = new MembershipsService(
      prisma as unknown as PrismaService,
      members as unknown as MembersService,
      plans as unknown as MembershipPlansService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('scoping', () => {
    function filters(): Record<string, unknown>[] {
      return prisma.memberMembership.findMany.mock.calls[0][0].where.AND as Record<
        string,
        unknown
      >[];
    }

    it('places no restriction on an administrator', async () => {
      await service.findMany(query(), principal(UserRole.ADMIN));
      expect(filters()[0]).toEqual({});
    });

    it('reuses the member visibility rule for a trainer', async () => {
      await service.findMany(query(), principal(UserRole.TRAINER));

      expect(members.scopeFor).toHaveBeenCalled();
      expect(filters()[0]).toEqual({ member: { assignedTrainerId: 'trainer-1' } });
    });

    it('restricts a member to their own memberships', async () => {
      await service.findMany(query(), principal(UserRole.MEMBER));
      expect(filters()[0]).toEqual({ member: { userId: 'user-1' } });
    });

    it('reports an out-of-scope membership as not found', async () => {
      prisma.memberMembership.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneScoped('mm-9', principal(UserRole.TRAINER)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });

    it('filters by expiry window for reminder queries', async () => {
      await service.findMany(
        query({ endingBefore: '2026-03-31', endingAfter: '2026-03-01' }),
        principal(UserRole.ADMIN),
      );

      expect(filters()).toContainEqual({ endDate: { lte: d('2026-03-31') } });
      expect(filters()).toContainEqual({ endDate: { gte: d('2026-03-01') } });
    });
  });

  describe('create', () => {
    it('captures the plan price at purchase', async () => {
      const created = (await service.create({
        memberId: 'member-1',
        planId: 'plan-1',
      })) as unknown as Record<string, unknown>;

      expect((created.purchasePrice as Prisma.Decimal).toFixed(2)).toBe('49.99');
    });

    it('honours a negotiated price override', async () => {
      const created = (await service.create({
        memberId: 'member-1',
        planId: 'plan-1',
        purchasePrice: 39.5,
      })) as unknown as Record<string, unknown>;

      expect((created.purchasePrice as Prisma.Decimal).toFixed(2)).toBe('39.50');
    });

    it('copies the visit allowance from the plan', async () => {
      plans.findSellableOrFail.mockResolvedValue(makePlan({ visitLimit: 12 }));

      const created = (await service.create({
        memberId: 'member-1',
        planId: 'plan-1',
      })) as unknown as Record<string, unknown>;

      expect(created.visitLimit).toBe(12);
    });

    it('derives the inclusive end date from the plan duration', async () => {
      const created = (await service.create({
        memberId: 'member-1',
        planId: 'plan-1',
        startDate: '2026-01-01',
      })) as unknown as Record<string, unknown>;

      expect((created.startDate as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect((created.endDate as Date).toISOString()).toBe('2026-01-30T00:00:00.000Z');
    });

    it('marks a future-dated membership PENDING', async () => {
      const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

      const created = (await service.create({
        memberId: 'member-1',
        planId: 'plan-1',
        startDate: future,
      })) as unknown as Record<string, unknown>;

      expect(created.status).toBe(MembershipStatus.PENDING);
    });

    it('refuses to sell to an archived member', async () => {
      members.findOneOrFail.mockResolvedValue({ id: 'member-1', status: ProfileStatus.ARCHIVED });

      await expect(service.create({ memberId: 'member-1', planId: 'plan-1' })).rejects.toThrow(
        /archived member/,
      );
    });

    it('rejects a membership overlapping an existing one', async () => {
      prisma.memberMembership.findFirst.mockResolvedValue({
        id: 'mm-existing',
        startDate: d('2026-01-01'),
        endDate: d('2026-01-30'),
      });

      await expect(
        service.create({ memberId: 'member-1', planId: 'plan-1', startDate: '2026-01-15' }),
      ).rejects.toThrow(/already has a membership covering 2026-01-01 to 2026-01-30/);
    });

    it('only treats live memberships as occupying the calendar', async () => {
      await service.create({ memberId: 'member-1', planId: 'plan-1' });

      const where = prisma.memberMembership.findFirst.mock.calls[0][0].where as {
        status: { in: MembershipStatus[] };
      };
      expect(where.status.in).toEqual(
        expect.arrayContaining([
          MembershipStatus.PENDING,
          MembershipStatus.ACTIVE,
          MembershipStatus.FROZEN,
        ]),
      );
      expect(where.status.in).not.toContain(MembershipStatus.EXPIRED);
      expect(where.status.in).not.toContain(MembershipStatus.CANCELLED);
    });
  });

  describe('renew', () => {
    beforeEach(() => {
      prisma.memberMembership.findUnique.mockResolvedValue(makeMembership());
    });

    it('starts the day after the current term and links back to it', async () => {
      const renewed = (await service.renew('mm-1', {})) as unknown as Record<string, unknown>;

      expect(renewed.previousMembershipId).toBe('mm-1');
      // The old term ended 2026-01-30, long past, so a renewal starts today.
      expect(renewed.startDate).toBeInstanceOf(Date);
    });

    it('prices from the plan today, leaving the old purchase price alone', async () => {
      plans.findSellableOrFail.mockResolvedValue(makePlan({ price: new Prisma.Decimal('59.99') }));

      const renewed = (await service.renew('mm-1', {})) as unknown as Record<string, unknown>;

      expect((renewed.purchasePrice as Prisma.Decimal).toFixed(2)).toBe('59.99');
      expect(prisma.memberMembership.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ purchasePrice: expect.anything() }),
        }),
      );
    });

    it('can switch plan on renewal', async () => {
      await service.renew('mm-1', { planId: 'plan-2' });
      expect(plans.findSellableOrFail).toHaveBeenCalledWith('plan-2');
    });

    it('defaults to the same plan', async () => {
      await service.renew('mm-1', {});
      expect(plans.findSellableOrFail).toHaveBeenCalledWith('plan-1');
    });

    it('refuses to renew a cancelled membership', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeMembership({ status: MembershipStatus.CANCELLED }),
      );

      await expect(service.renew('mm-1', {})).rejects.toThrow(
        /cancelled membership cannot be renewed/,
      );
    });

    it('refuses to renew twice', async () => {
      // First findFirst call is the renewal-exists probe.
      prisma.memberMembership.findFirst.mockResolvedValueOnce({ id: 'mm-2' });

      await expect(service.renew('mm-1', {})).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });
  });

  describe('extend', () => {
    it('pushes the end date out and records the added days', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(makeMembership());

      await service.extend('mm-1', { days: 7 });

      const data = prisma.memberMembership.update.mock.calls.at(-1)?.[0].data as Record<
        string,
        unknown
      >;
      expect((data.endDate as Date).toISOString()).toBe('2026-02-06T00:00:00.000Z');
      expect(data.extendedDays).toEqual({ increment: 7 });
    });

    it('revives an expired membership when the new end date is in the future', async () => {
      const farFuture = new Date(Date.now() + 10 * 86_400_000);
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeMembership({
          status: MembershipStatus.EXPIRED,
          startDate: new Date(Date.now() - 40 * 86_400_000),
          endDate: new Date(Date.now() - 1 * 86_400_000),
        }),
      );

      await service.extend('mm-1', { days: 11 });

      const data = prisma.memberMembership.update.mock.calls.at(-1)?.[0].data as Record<
        string,
        unknown
      >;
      expect(data.status).toBe(MembershipStatus.ACTIVE);
      expect(data.endDate).toBeInstanceOf(Date);
      expect((data.endDate as Date).getTime()).toBeGreaterThan(
        farFuture.getTime() - 2 * 86_400_000,
      );
    });

    it('refuses to extend a cancelled membership', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeMembership({ status: MembershipStatus.CANCELLED }),
      );

      await expect(service.extend('mm-1', { days: 7 })).rejects.toThrow(/cannot be extended/);
    });
  });

  describe('freeze', () => {
    it('records a freeze episode and stops the clock', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(makeCurrentMembership());

      await service.freeze('mm-1', { reason: 'Travelling' });

      expect(prisma.membershipFreeze.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ membershipId: 'mm-1', reason: 'Travelling' }),
      });

      const data = prisma.memberMembership.update.mock.calls.at(-1)?.[0].data as Record<
        string,
        unknown
      >;
      expect(data.status).toBe(MembershipStatus.FROZEN);
      expect(data.frozenAt).toBeInstanceOf(Date);
    });

    it('does not move the end date at freeze time', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(makeCurrentMembership());

      await service.freeze('mm-1', {});

      const data = prisma.memberMembership.update.mock.calls.at(-1)?.[0].data as Record<
        string,
        unknown
      >;
      expect(data).not.toHaveProperty('endDate');
    });

    it('refuses to freeze twice', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeCurrentMembership({ status: MembershipStatus.FROZEN }),
      );
      await expect(service.freeze('mm-1', {})).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });

    it.each([MembershipStatus.EXPIRED, MembershipStatus.CANCELLED])(
      'refuses to freeze a %s membership',
      async (status) => {
        prisma.memberMembership.findUnique.mockResolvedValue(
          makeMembership({
            status,
            startDate: d('2020-01-01'),
            endDate: d('2020-01-30'),
          }),
        );

        await expect(service.freeze('mm-1', {})).rejects.toThrow(/cannot be frozen/);
      },
    );
  });

  describe('unfreeze', () => {
    it('credits back every whole day paused', async () => {
      const frozenAt = new Date(Date.now() - 5 * 86_400_000);
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeMembership({ status: MembershipStatus.FROZEN, frozenAt }),
      );
      prisma.membershipFreeze.findFirst.mockResolvedValue({ id: 'freeze-1' });

      await service.unfreeze('mm-1');

      const data = prisma.memberMembership.update.mock.calls.at(-1)?.[0].data as Record<
        string,
        unknown
      >;
      expect(data.totalFrozenDays).toEqual({ increment: 5 });
      expect((data.endDate as Date).toISOString()).toBe('2026-02-04T00:00:00.000Z');
      expect(data.frozenAt).toBeNull();
    });

    it('closes the open freeze episode with the credited days', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeMembership({
          status: MembershipStatus.FROZEN,
          frozenAt: new Date(Date.now() - 3 * 86_400_000),
        }),
      );
      prisma.membershipFreeze.findFirst.mockResolvedValue({ id: 'freeze-1' });

      await service.unfreeze('mm-1');

      expect(prisma.membershipFreeze.update).toHaveBeenCalledWith({
        where: { id: 'freeze-1' },
        data: expect.objectContaining({ days: 3, endedAt: expect.any(Date) }),
      });
    });

    it('credits nothing for a same-day freeze and unfreeze', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeMembership({ status: MembershipStatus.FROZEN, frozenAt: new Date() }),
      );

      await service.unfreeze('mm-1');

      const data = prisma.memberMembership.update.mock.calls.at(-1)?.[0].data as Record<
        string,
        unknown
      >;
      expect(data.totalFrozenDays).toEqual({ increment: 0 });
    });

    it('refuses to unfreeze a membership that is not frozen', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(makeMembership());
      await expect(service.unfreeze('mm-1')).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });
  });

  describe('cancel', () => {
    it('records the reason and closes any open freeze', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeCurrentMembership({ status: MembershipStatus.FROZEN, frozenAt: new Date() }),
      );

      await service.cancel('mm-1', { reason: 'Relocated' });

      expect(prisma.membershipFreeze.updateMany).toHaveBeenCalledWith({
        where: { membershipId: 'mm-1', endedAt: null },
        data: expect.objectContaining({ days: 0 }),
      });

      const data = prisma.memberMembership.update.mock.calls.at(-1)?.[0].data as Record<
        string,
        unknown
      >;
      expect(data.status).toBe(MembershipStatus.CANCELLED);
      expect(data.cancellationReason).toBe('Relocated');
      expect(data.frozenAt).toBeNull();
    });

    it('refuses to cancel twice', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeCurrentMembership({ status: MembershipStatus.CANCELLED }),
      );
      await expect(service.cancel('mm-1', {})).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });
  });

  describe('expire', () => {
    it('pulls the end date back to today so the sweep cannot revive it', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeMembership({
          startDate: new Date(Date.now() - 5 * 86_400_000),
          endDate: new Date(Date.now() + 20 * 86_400_000),
        }),
      );

      await service.expire('mm-1');

      const data = prisma.memberMembership.update.mock.calls.at(-1)?.[0].data as Record<
        string,
        unknown
      >;
      expect(data.status).toBe(MembershipStatus.EXPIRED);
      expect((data.endDate as Date).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('refuses to expire an already expired membership', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeMembership({ status: MembershipStatus.EXPIRED, endDate: d('2020-01-30') }),
      );
      await expect(service.expire('mm-1')).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('refuses to expire a cancelled membership', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(
        makeMembership({ status: MembershipStatus.CANCELLED }),
      );
      await expect(service.expire('mm-1')).rejects.toThrow(
        /cancelled membership cannot be expired/,
      );
    });
  });

  describe('syncOverdue', () => {
    it('expires overdue memberships and activates pending ones', async () => {
      prisma.$transaction.mockResolvedValue([{ count: 4 }, { count: 2 }]);

      await expect(service.syncOverdue()).resolves.toEqual({ expired: 4, activated: 2 });
    });

    it('never touches frozen or cancelled memberships', async () => {
      prisma.$transaction.mockImplementation((ops: unknown) => {
        void ops;
        return Promise.resolve([{ count: 0 }, { count: 0 }]);
      });

      await service.syncOverdue();

      const expireCall = prisma.memberMembership.updateMany.mock.calls[0]?.[0] as
        { where: { status: { in: MembershipStatus[] } } } | undefined;

      if (expireCall) {
        expect(expireCall.where.status.in).not.toContain(MembershipStatus.FROZEN);
        expect(expireCall.where.status.in).not.toContain(MembershipStatus.CANCELLED);
      }
    });
  });
});
