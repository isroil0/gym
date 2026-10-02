import { MembershipPlanStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import { MembershipPlansService } from './membership-plans.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { QueryMembershipPlansDto } from './dto/membership-plan.dto';

function principal(role: UserRole): AuthenticatedUser {
  return { id: 'user-1', email: 'a@gym.test', role, status: UserStatus.ACTIVE };
}

function query(overrides: Partial<QueryMembershipPlansDto> = {}): QueryMembershipPlansDto {
  return { page: 1, limit: 20, skip: 0, take: 20, ...overrides };
}

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    name: 'Monthly Unlimited',
    description: null,
    durationDays: 30,
    price: new Prisma.Decimal('49.99'),
    visitLimit: null,
    displayOrder: 0,
    status: MembershipPlanStatus.ACTIVE,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('MembershipPlansService', () => {
  let prisma: {
    membershipPlan: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    memberMembership: { count: jest.Mock; groupBy: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: MembershipPlansService;

  beforeEach(() => {
    prisma = {
      membershipPlan: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
        update: jest.fn().mockResolvedValue(makePlan()),
      },
      memberMembership: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };

    service = new MembershipPlansService(prisma as unknown as PrismaService);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  function filters(): Record<string, unknown>[] {
    return prisma.membershipPlan.findMany.mock.calls[0][0].where.AND as Record<string, unknown>[];
  }

  describe('visibility', () => {
    it('shows an administrator every plan', async () => {
      await service.findMany(query(), principal(UserRole.ADMIN));
      expect(filters()[0]).toEqual({});
    });

    it.each([UserRole.TRAINER, UserRole.MEMBER])('shows %s only plans on sale', async (role) => {
      await service.findMany(query(), principal(role));
      expect(filters()[0]).toEqual({ status: MembershipPlanStatus.ACTIVE });
    });

    it('gives a member an empty result for an explicit ARCHIVED filter rather than active plans', async () => {
      await service.findMany(
        query({ status: MembershipPlanStatus.ARCHIVED }),
        principal(UserRole.MEMBER),
      );

      const applied = filters();
      expect(applied).toContainEqual({ status: MembershipPlanStatus.ACTIVE });
      expect(applied).toContainEqual({ status: MembershipPlanStatus.ARCHIVED });
    });

    it('lets an administrator filter for archived plans', async () => {
      await service.findMany(
        query({ status: MembershipPlanStatus.ARCHIVED }),
        principal(UserRole.ADMIN),
      );
      expect(filters()).toContainEqual({ status: MembershipPlanStatus.ARCHIVED });
    });

    it('hides an archived plan from a member reading it by id', async () => {
      prisma.membershipPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneVisible('plan-1', principal(UserRole.MEMBER)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });

      expect(prisma.membershipPlan.findFirst.mock.calls[0][0].where.AND).toContainEqual({
        status: MembershipPlanStatus.ACTIVE,
      });
    });

    it('orders plans by display order, then price, then name', async () => {
      await service.findMany(query(), principal(UserRole.ADMIN));

      expect(prisma.membershipPlan.findMany.mock.calls[0][0].orderBy).toEqual([
        { displayOrder: 'asc' },
        { price: 'asc' },
        { name: 'asc' },
      ]);
    });
  });

  describe('create', () => {
    it('stores the price as a decimal', async () => {
      const created = (await service.create({
        name: 'Weekly',
        durationDays: 7,
        price: 19.99,
      })) as unknown as Record<string, unknown>;

      expect(created.price).toBeInstanceOf(Prisma.Decimal);
      expect((created.price as Prisma.Decimal).toFixed(2)).toBe('19.99');
    });

    it('defaults visitLimit to null, meaning unlimited', async () => {
      const created = (await service.create({
        name: 'Weekly',
        durationDays: 7,
        price: 19.99,
      })) as unknown as Record<string, unknown>;

      expect(created.visitLimit).toBeNull();
    });

    it('keeps an explicit visit limit', async () => {
      const created = (await service.create({
        name: 'Ten Pack',
        durationDays: 60,
        price: 89,
        visitLimit: 10,
      })) as unknown as Record<string, unknown>;

      expect(created.visitLimit).toBe(10);
    });

    it('rejects a duplicate name', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ name: 'Monthly Unlimited', durationDays: 30, price: 49.99 }),
      ).rejects.toMatchObject({
        errorCode: 'CONFLICT',
        details: [{ field: 'name', messages: ['must be unique'] }],
      });
    });
  });

  describe('findSellableOrFail', () => {
    it('returns an active plan', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(makePlan());
      await expect(service.findSellableOrFail('plan-1')).resolves.toMatchObject({ id: 'plan-1' });
    });

    it('refuses an archived plan', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(
        makePlan({ status: MembershipPlanStatus.ARCHIVED }),
      );

      await expect(service.findSellableOrFail('plan-1')).rejects.toThrow(
        /archived and cannot be sold/,
      );
    });

    it('rejects an unknown plan', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(null);
      await expect(service.findSellableOrFail('ghost')).rejects.toMatchObject({
        errorCode: 'NOT_FOUND',
      });
    });
  });

  describe('archive / reactivate', () => {
    it('archives and stamps the time', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(makePlan());

      await service.archive('plan-1');

      const data = prisma.membershipPlan.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.status).toBe(MembershipPlanStatus.ARCHIVED);
      expect(data.archivedAt).toBeInstanceOf(Date);
    });

    it('refuses to archive twice', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(
        makePlan({ status: MembershipPlanStatus.ARCHIVED }),
      );
      await expect(service.archive('plan-1')).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('refuses to reactivate an active plan', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(makePlan());
      await expect(service.reactivate('plan-1')).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('does not touch the memberships already sold on the plan', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(makePlan());

      await service.archive('plan-1');

      // Counted for the log only — never updated.
      expect(prisma.memberMembership.count).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('allows keeping the same name', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(makePlan());

      await service.update('plan-1', { name: 'Monthly Unlimited', price: 59.99 });

      const data = prisma.membershipPlan.update.mock.calls[0][0].data as Record<string, unknown>;
      expect((data.price as Prisma.Decimal).toFixed(2)).toBe('59.99');
    });

    it("rejects renaming onto another plan's name", async () => {
      prisma.membershipPlan.findUnique
        .mockResolvedValueOnce(makePlan())
        .mockResolvedValueOnce({ id: 'other' });

      await expect(service.update('plan-1', { name: 'Annual Unlimited' })).rejects.toMatchObject({
        errorCode: 'CONFLICT',
      });
    });

    it('can make a limited plan unlimited', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(makePlan({ visitLimit: 12 }));

      await service.update('plan-1', { visitLimit: null });

      const data = prisma.membershipPlan.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.visitLimit).toBeNull();
    });
  });
});
