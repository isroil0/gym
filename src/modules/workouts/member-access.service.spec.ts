import { UserRole, UserStatus } from '@prisma/client';
import { MemberAccessService } from './member-access.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MembersService } from '../members/members.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

function principal(role: UserRole): AuthenticatedUser {
  return { id: 'user-1', email: 'a@gym.test', role, status: UserStatus.ACTIVE };
}

describe('MemberAccessService', () => {
  let prisma: {
    member: { findFirst: jest.Mock };
    trainer: { findUnique: jest.Mock };
  };
  let members: { scopeFor: jest.Mock; findByUserIdOrFail: jest.Mock };
  let service: MemberAccessService;

  beforeEach(() => {
    prisma = {
      member: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
      trainer: { findUnique: jest.fn().mockResolvedValue({ id: 'trainer-1' }) },
    };
    members = {
      scopeFor: jest.fn().mockResolvedValue({ assignedTrainerId: 'trainer-1' }),
      findByUserIdOrFail: jest.fn().mockResolvedValue({ id: 'member-9' }),
    };

    service = new MemberAccessService(
      prisma as unknown as PrismaService,
      members as unknown as MembersService,
    );
  });

  describe('assertCanManage', () => {
    it('allows an administrator', async () => {
      members.scopeFor.mockResolvedValue({});

      await expect(
        service.assertCanManage('member-1', principal(UserRole.ADMIN)),
      ).resolves.toBeUndefined();
    });

    it('allows a trainer for an assigned member', async () => {
      await expect(
        service.assertCanManage('member-1', principal(UserRole.TRAINER)),
      ).resolves.toBeUndefined();

      expect(prisma.member.findFirst.mock.calls[0][0].where.AND).toContainEqual({
        assignedTrainerId: 'trainer-1',
      });
    });

    it('reports an unassigned member as not found, not forbidden', async () => {
      prisma.member.findFirst.mockResolvedValue(null);

      await expect(
        service.assertCanManage('member-9', principal(UserRole.TRAINER)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });

    it('refuses a member outright, without a database lookup', async () => {
      await expect(
        service.assertCanManage('member-1', principal(UserRole.MEMBER)),
      ).rejects.toMatchObject({ errorCode: 'FORBIDDEN' });

      expect(prisma.member.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('readScope', () => {
    it('scopes a member to their own profile', async () => {
      await expect(service.readScope(principal(UserRole.MEMBER))).resolves.toEqual({
        userId: 'user-1',
      });
    });

    it('delegates to the member visibility rule for staff', async () => {
      await expect(service.readScope(principal(UserRole.TRAINER))).resolves.toEqual({
        assignedTrainerId: 'trainer-1',
      });
      expect(members.scopeFor).toHaveBeenCalled();
    });
  });

  describe('ownTrainerId', () => {
    it('returns the trainer profile id', async () => {
      await expect(service.ownTrainerId('user-1')).resolves.toBe('trainer-1');
    });

    it('returns null when the account has no trainer profile', async () => {
      prisma.trainer.findUnique.mockResolvedValue(null);
      await expect(service.ownTrainerId('user-1')).resolves.toBeNull();
    });
  });
});
