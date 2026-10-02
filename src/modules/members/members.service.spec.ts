import { ProfileStatus, UserRole, UserStatus, type Member } from '@prisma/client';
import { MembersService } from './members.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AccountProvisioningService } from '../users/account-provisioning.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { QueryMembersDto } from './dto/query-members.dto';

const NOBODY = '00000000-0000-0000-0000-000000000000';

function principal(role: UserRole, id = 'user-1'): AuthenticatedUser {
  return { id, email: `${role.toLowerCase()}@gym.test`, role, status: UserStatus.ACTIVE };
}

function query(overrides: Partial<QueryMembersDto> = {}): QueryMembersDto {
  return { page: 1, limit: 20, skip: 0, take: 20, ...overrides };
}

describe('MembersService', () => {
  let prisma: {
    member: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    trainer: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let accounts: { resolve: jest.Mock };
  let service: MembersService;

  beforeEach(() => {
    prisma = {
      member: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      trainer: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };
    accounts = { resolve: jest.fn() };

    service = new MembersService(
      prisma as unknown as PrismaService,
      accounts as unknown as AccountProvisioningService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  /** The AND-ed where fragments passed to findMany. */
  function whereFilters(): Record<string, unknown>[] {
    return prisma.member.findMany.mock.calls[0][0].where.AND as Record<string, unknown>[];
  }

  describe('scoping', () => {
    it('applies no restriction for an ADMIN', async () => {
      await service.findMany(query(), principal(UserRole.ADMIN));
      expect(whereFilters()[0]).toEqual({});
    });

    it('restricts a TRAINER to their own assigned members', async () => {
      prisma.trainer.findUnique.mockResolvedValue({ id: 'trainer-7' });

      await service.findMany(query(), principal(UserRole.TRAINER));

      expect(prisma.trainer.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { id: true },
      });
      expect(whereFilters()[0]).toEqual({ assignedTrainerId: 'trainer-7' });
    });

    it('fails closed for a trainer account with no profile', async () => {
      prisma.trainer.findUnique.mockResolvedValue(null);

      await service.findMany(query(), principal(UserRole.TRAINER));

      expect(whereFilters()[0]).toEqual({ assignedTrainerId: NOBODY });
    });

    it('fails closed for a MEMBER reaching the collection', async () => {
      await service.findMany(query(), principal(UserRole.MEMBER));
      expect(whereFilters()[0]).toEqual({ id: NOBODY });
    });

    it('ignores an assignedTrainerId filter from a trainer, so scope cannot widen', async () => {
      prisma.trainer.findUnique.mockResolvedValue({ id: 'trainer-7' });

      await service.findMany(
        query({ assignedTrainerId: 'someone-else' }),
        principal(UserRole.TRAINER),
      );

      const filters = whereFilters();
      expect(filters[0]).toEqual({ assignedTrainerId: 'trainer-7' });
      expect(JSON.stringify(filters)).not.toContain('someone-else');
    });

    it('honours an assignedTrainerId filter from an admin', async () => {
      await service.findMany(query({ assignedTrainerId: 'trainer-9' }), principal(UserRole.ADMIN));
      expect(whereFilters()).toContainEqual({ assignedTrainerId: 'trainer-9' });
    });

    it('reports a member outside scope as not found, not forbidden', async () => {
      prisma.trainer.findUnique.mockResolvedValue({ id: 'trainer-7' });
      prisma.member.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneScoped('member-9', principal(UserRole.TRAINER)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('filters', () => {
    it('filters by status and gender', async () => {
      await service.findMany(
        query({ status: ProfileStatus.ARCHIVED, gender: 'FEMALE' }),
        principal(UserRole.ADMIN),
      );

      const filters = whereFilters();
      expect(filters).toContainEqual({ status: ProfileStatus.ARCHIVED });
      expect(filters).toContainEqual({ gender: 'FEMALE' });
    });

    it('filters members without a trainer', async () => {
      await service.findMany(query({ unassigned: true }), principal(UserRole.ADMIN));
      expect(whereFilters()).toContainEqual({ assignedTrainerId: null });
    });

    it('filters members that have a trainer', async () => {
      await service.findMany(query({ unassigned: false }), principal(UserRole.ADMIN));
      expect(whereFilters()).toContainEqual({ assignedTrainerId: { not: null } });
    });

    it('searches name and email case-insensitively', async () => {
      await service.findMany(query({ search: 'mia' }), principal(UserRole.ADMIN));

      const search = whereFilters().at(-1) as { OR: unknown[] };
      expect(search.OR).toHaveLength(3);
      expect(JSON.stringify(search.OR)).toContain('insensitive');
    });

    it.each([
      ['M-000042', 42],
      ['m-000042', 42],
      ['000042', 42],
      ['42', 42],
    ])('resolves the member code %s to member number %i', async (input, expected) => {
      await service.findMany(query({ search: input }), principal(UserRole.ADMIN));

      const search = whereFilters().at(-1) as { OR: unknown[] };
      expect(search.OR).toContainEqual({ memberNumber: expected });
    });

    it('does not add a number clause for a non-numeric search', async () => {
      await service.findMany(query({ search: 'mia' }), principal(UserRole.ADMIN));

      const search = whereFilters().at(-1) as { OR: unknown[] };
      expect(JSON.stringify(search.OR)).not.toContain('memberNumber');
    });
  });

  describe('assignTrainer', () => {
    const member = {
      id: 'member-1',
      userId: 'user-1',
      status: ProfileStatus.ACTIVE,
    } as unknown as Member;

    beforeEach(() => {
      prisma.member.findUnique.mockResolvedValue(member);
      prisma.member.update.mockResolvedValue(member);
    });

    it('assigns an active trainer and stamps the assignment time', async () => {
      prisma.trainer.findUnique.mockResolvedValue({
        id: 'trainer-1',
        status: ProfileStatus.ACTIVE,
      });

      await service.assignTrainer('member-1', 'trainer-1');

      const data = prisma.member.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.assignedTrainerId).toBe('trainer-1');
      expect(data.assignedAt).toBeInstanceOf(Date);
    });

    it('unassigns and clears the assignment time', async () => {
      await service.assignTrainer('member-1', null);

      expect(prisma.member.update.mock.calls[0][0].data).toEqual({
        assignedTrainerId: null,
        assignedAt: null,
      });
    });

    it('rejects an unknown trainer', async () => {
      prisma.trainer.findUnique.mockResolvedValue(null);

      await expect(service.assignTrainer('member-1', 'ghost')).rejects.toMatchObject({
        errorCode: 'NOT_FOUND',
      });
    });

    it('refuses to assign an archived trainer', async () => {
      prisma.trainer.findUnique.mockResolvedValue({
        id: 'trainer-1',
        status: ProfileStatus.ARCHIVED,
      });

      await expect(service.assignTrainer('member-1', 'trainer-1')).rejects.toThrow(
        /archived and cannot take on members/,
      );
    });

    it('refuses to assign a trainer to an archived member', async () => {
      prisma.member.findUnique.mockResolvedValue({ ...member, status: ProfileStatus.ARCHIVED });
      prisma.trainer.findUnique.mockResolvedValue({
        id: 'trainer-1',
        status: ProfileStatus.ACTIVE,
      });

      await expect(service.assignTrainer('member-1', 'trainer-1')).rejects.toThrow(
        /Cannot assign a trainer to an archived member/,
      );
    });
  });

  describe('archive / reactivate', () => {
    it('refuses to archive an already archived member', async () => {
      prisma.member.findUnique.mockResolvedValue({ status: ProfileStatus.ARCHIVED });

      await expect(service.archive('member-1')).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('refuses to reactivate an already active member', async () => {
      prisma.member.findUnique.mockResolvedValue({ status: ProfileStatus.ACTIVE });

      await expect(service.reactivate('member-1')).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });
  });

  describe('isAssignedTo', () => {
    it('is true only for the assigned trainer', () => {
      const member = { assignedTrainerId: 'trainer-1' } as Member;

      expect(MembersService.isAssignedTo(member, 'trainer-1')).toBe(true);
      expect(MembersService.isAssignedTo(member, 'trainer-2')).toBe(false);
      expect(MembersService.isAssignedTo({ assignedTrainerId: null } as Member, 'trainer-1')).toBe(
        false,
      );
    });
  });
});
