import { CompensationType, Prisma, ProfileStatus, UserStatus } from '@prisma/client';
import { TrainersService } from './trainers.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AccountProvisioningService } from '../users/account-provisioning.service';
import type { QueryTrainersDto } from './dto/query-trainers.dto';
import type { TrainerWithRelations } from './dto/trainer-response.dto';

function query(overrides: Partial<QueryTrainersDto> = {}): QueryTrainersDto {
  return { page: 1, limit: 20, skip: 0, take: 20, ...overrides };
}

function makeTrainer(overrides: Record<string, unknown> = {}): TrainerWithRelations {
  return {
    id: 'trainer-1',
    userId: 'user-1',
    trainerNumber: 1,
    specialization: null,
    bio: null,
    certifications: null,
    compensationType: CompensationType.NONE,
    monthlySalary: null,
    commissionRate: null,
    hiredAt: new Date(),
    status: ProfileStatus.ACTIVE,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { email: 'tina@gym.test' },
    ...overrides,
  } as unknown as TrainerWithRelations;
}

describe('TrainersService', () => {
  let prisma: {
    trainer: { findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    member: { updateMany: jest.Mock };
    user: { update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: TrainersService;

  beforeEach(() => {
    prisma = {
      trainer: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(makeTrainer()),
      },
      member: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: { update: jest.fn().mockResolvedValue({}) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn(),
    };

    // Run interactive transactions against the same mock client.
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.resolve([[], 0]),
    );

    service = new TrainersService(
      prisma as unknown as PrismaService,
      {} as AccountProvisioningService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('search', () => {
    it('matches name, email and specialization case-insensitively', async () => {
      await service.findMany(query({ search: 'strength' }));

      const where = prisma.trainer.findMany.mock.calls[0][0].where as { AND: { OR: unknown[] }[] };
      expect(where.AND[0].OR).toHaveLength(4);
      expect(JSON.stringify(where.AND[0].OR)).toContain('specialization');
    });

    it.each([
      ['T-000007', 7],
      ['t-7', 7],
      ['7', 7],
    ])('resolves the trainer code %s to trainer number %i', async (input, expected) => {
      await service.findMany(query({ search: input }));

      const where = prisma.trainer.findMany.mock.calls[0][0].where as { AND: { OR: unknown[] }[] };
      expect(where.AND[0].OR).toContainEqual({ trainerNumber: expected });
    });

    it('applies no filter when none is given', async () => {
      await service.findMany(query());
      expect(prisma.trainer.findMany.mock.calls[0][0].where).toEqual({});
    });
  });

  describe('archive', () => {
    it("unassigns the trainer's members, deactivates the account and revokes sessions", async () => {
      prisma.trainer.findUnique.mockResolvedValue(makeTrainer());
      prisma.member.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.archive('trainer-1');

      expect(prisma.member.updateMany).toHaveBeenCalledWith({
        where: { assignedTrainerId: 'trainer-1' },
        data: { assignedTrainerId: null, assignedAt: null },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: UserStatus.INACTIVE },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
      expect(result.unassignedMemberCount).toBe(3);
    });

    it('reports zero when the trainer had no members', async () => {
      prisma.trainer.findUnique.mockResolvedValue(makeTrainer());

      const result = await service.archive('trainer-1');
      expect(result.unassignedMemberCount).toBe(0);
    });

    it('refuses to archive an already archived trainer', async () => {
      prisma.trainer.findUnique.mockResolvedValue(makeTrainer({ status: ProfileStatus.ARCHIVED }));

      await expect(service.archive('trainer-1')).rejects.toMatchObject({ errorCode: 'CONFLICT' });
      expect(prisma.member.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an unknown trainer', async () => {
      prisma.trainer.findUnique.mockResolvedValue(null);
      await expect(service.archive('ghost')).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('reactivate', () => {
    it('restores the profile and the login account', async () => {
      prisma.trainer.findUnique.mockResolvedValue(makeTrainer({ status: ProfileStatus.ARCHIVED }));

      await service.reactivate('trainer-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: UserStatus.ACTIVE },
      });
      expect(prisma.trainer.update.mock.calls[0][0].data).toEqual({
        status: ProfileStatus.ACTIVE,
        archivedAt: null,
      });
    });

    it('does not reassign members on reactivation', async () => {
      prisma.trainer.findUnique.mockResolvedValue(makeTrainer({ status: ProfileStatus.ARCHIVED }));

      await service.reactivate('trainer-1');

      expect(prisma.member.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to reactivate an already active trainer', async () => {
      prisma.trainer.findUnique.mockResolvedValue(makeTrainer());
      await expect(service.reactivate('trainer-1')).rejects.toMatchObject({
        errorCode: 'CONFLICT',
      });
    });
  });

  describe('findByUserIdOrFail', () => {
    it('explains that the account has no trainer profile', async () => {
      prisma.trainer.findUnique.mockResolvedValue(null);

      await expect(service.findByUserIdOrFail('user-9')).rejects.toThrow(
        /Trainer profile for the current account not found/,
      );
    });
  });

  describe('setCompensation', () => {
    beforeEach(() => {
      prisma.trainer.findUnique.mockResolvedValue(makeTrainer());
    });

    it('stores a fixed salary and clears any commission rate', async () => {
      await service.setCompensation('trainer-1', {
        compensationType: CompensationType.FIXED,
        monthlySalary: 2500,
        commissionRate: 15,
      });

      const data = prisma.trainer.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.compensationType).toBe(CompensationType.FIXED);
      expect((data.monthlySalary as Prisma.Decimal).toFixed(2)).toBe('2500.00');
      // A stale rate must not survive, or a later payroll run would pay it.
      expect(data.commissionRate).toBeNull();
    });

    it('stores a commission rate and clears any salary', async () => {
      await service.setCompensation('trainer-1', {
        compensationType: CompensationType.COMMISSION,
        monthlySalary: 2500,
        commissionRate: 15,
      });

      const data = prisma.trainer.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.monthlySalary).toBeNull();
      expect((data.commissionRate as Prisma.Decimal).toFixed(2)).toBe('15.00');
    });

    it('keeps both for FIXED_PLUS_COMMISSION', async () => {
      await service.setCompensation('trainer-1', {
        compensationType: CompensationType.FIXED_PLUS_COMMISSION,
        monthlySalary: 2000,
        commissionRate: 10,
      });

      const data = prisma.trainer.update.mock.calls[0][0].data as Record<string, unknown>;
      expect((data.monthlySalary as Prisma.Decimal).toFixed(2)).toBe('2000.00');
      expect((data.commissionRate as Prisma.Decimal).toFixed(2)).toBe('10.00');
    });

    it('clears both for NONE', async () => {
      await service.setCompensation('trainer-1', { compensationType: CompensationType.NONE });

      const data = prisma.trainer.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.monthlySalary).toBeNull();
      expect(data.commissionRate).toBeNull();
    });

    it('rejects an unknown trainer', async () => {
      prisma.trainer.findUnique.mockResolvedValue(null);

      await expect(
        service.setCompensation('ghost', { compensationType: CompensationType.NONE }),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });
});
