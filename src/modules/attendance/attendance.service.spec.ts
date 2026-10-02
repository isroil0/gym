import {
  CheckInMethod,
  MembershipStatus,
  Prisma,
  ProfileStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { buildCardToken } from './membership-card-token';
import { EntryDenialReason } from './entry-eligibility';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppConfigService } from '../../config/configuration';
import type { MembersService } from '../members/members.service';
import type { MembershipsService } from '../memberships/memberships.service';
import type { MembershipCardsService } from './membership-cards.service';
import type { GymTimeService } from '../../common/time/gym-time.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { QueryAttendanceDto } from './dto/attendance.dto';

const SECRET = 'a-test-qr-secret-that-is-long-enough-32';
const MEMBER_ID = '0b5f8a2e-1111-4000-8000-000000000001';

const ADMIN: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@gym.test',
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
};

function principal(role: UserRole): AuthenticatedUser {
  return { id: 'user-1', email: 'a@gym.test', role, status: UserStatus.ACTIVE };
}

function query(overrides: Partial<QueryAttendanceDto> = {}): QueryAttendanceDto {
  return { page: 1, limit: 20, skip: 0, take: 20, ...overrides };
}

/** The reason code the service puts in `details` of a refusal. */
function reasonOf(error: unknown): string | undefined {
  const details = (error as { details?: Array<{ field: string; messages: string[] }> }).details;
  return details?.[0]?.messages[0];
}

describe('AttendanceService', () => {
  let prisma: {
    attendance: {
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let members: { findOneOrFail: jest.Mock; scopeFor: jest.Mock };
  let memberships: {
    findRelevantForEntry: jest.Mock;
    consumeVisit: jest.Mock;
    releaseVisit: jest.Mock;
  };
  let cards: { findByMemberId: jest.Mock; markUsed: jest.Mock };
  let service: AttendanceService;

  const activeMember = {
    id: MEMBER_ID,
    status: ProfileStatus.ACTIVE,
    user: { status: UserStatus.ACTIVE, firstName: 'Mia', lastName: 'Member' },
  };

  const unlimitedMembership = {
    id: 'mm-1',
    status: MembershipStatus.ACTIVE,
    visitLimit: null,
    visitsUsed: 0,
    startDate: new Date(Date.now() - 86_400_000),
    endDate: new Date(Date.now() + 20 * 86_400_000),
  };

  beforeEach(() => {
    prisma = {
      attendance: {
        create: jest.fn().mockResolvedValue({ id: 'att-1', memberId: MEMBER_ID }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'att-1', memberId: MEMBER_ID, checkedOutAt: new Date() }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'att-1', memberId: MEMBER_ID, checkedOutAt: null }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.resolve([[], 0]),
    );

    members = {
      findOneOrFail: jest.fn().mockResolvedValue(activeMember),
      scopeFor: jest.fn().mockResolvedValue({ assignedTrainerId: 'trainer-1' }),
    };
    memberships = {
      findRelevantForEntry: jest.fn().mockResolvedValue(unlimitedMembership),
      consumeVisit: jest.fn().mockResolvedValue(undefined),
      releaseVisit: jest.fn().mockResolvedValue(undefined),
    };
    cards = {
      findByMemberId: jest.fn().mockResolvedValue({
        memberId: MEMBER_ID,
        version: 1,
        revokedAt: null,
      }),
      markUsed: jest.fn().mockResolvedValue(undefined),
    };

    service = new AttendanceService(
      prisma as unknown as PrismaService,
      { qrSecret: SECRET } as AppConfigService,
      members as unknown as MembersService,
      memberships as unknown as MembershipsService,
      cards as unknown as MembershipCardsService,
      {
        localDateOf: (instant: Date) => instant.toISOString().slice(0, 10),
        day: (localDate: string) => ({
          start: new Date(`${localDate}T00:00:00.000Z`),
          end: new Date(new Date(`${localDate}T00:00:00.000Z`).getTime() + 86_400_000),
        }),
      } as unknown as GymTimeService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('manual check-in', () => {
    it('opens a visit and records who let them in', async () => {
      const outcome = await service.checkInManually(MEMBER_ID, ADMIN, 'Walk-in');

      const data = prisma.attendance.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.method).toBe(CheckInMethod.MANUAL);
      expect(data.membershipId).toBe('mm-1');
      expect(data.recordedByUserId).toBe('admin-1');
      expect(data.notes).toBe('Walk-in');
      expect(outcome.visitsRemaining).toBeNull();
    });

    it('does not deduct a visit on an unlimited membership', async () => {
      await service.checkInManually(MEMBER_ID, ADMIN);

      expect(memberships.consumeVisit).not.toHaveBeenCalled();
      const data = prisma.attendance.create.mock.calls[0][0].data as { visitDeducted: boolean };
      expect(data.visitDeducted).toBe(false);
    });

    it('deducts a visit on a limited membership, in the same transaction', async () => {
      memberships.findRelevantForEntry.mockResolvedValue({
        ...unlimitedMembership,
        visitLimit: 10,
        visitsUsed: 3,
      });

      const outcome = await service.checkInManually(MEMBER_ID, ADMIN);

      expect(memberships.consumeVisit).toHaveBeenCalledWith(prisma, 'mm-1');
      expect(outcome.visitsRemaining).toBe(6);
      const data = prisma.attendance.create.mock.calls[0][0].data as { visitDeducted: boolean };
      expect(data.visitDeducted).toBe(true);
    });

    it.each([
      [
        'an archived member',
        () =>
          members.findOneOrFail.mockResolvedValue({
            ...activeMember,
            status: ProfileStatus.ARCHIVED,
          }),
        EntryDenialReason.MEMBER_ARCHIVED,
      ],
      [
        'a deactivated account',
        () =>
          members.findOneOrFail.mockResolvedValue({
            ...activeMember,
            user: { ...activeMember.user, status: UserStatus.INACTIVE },
          }),
        EntryDenialReason.ACCOUNT_INACTIVE,
      ],
      [
        'no membership',
        () => memberships.findRelevantForEntry.mockResolvedValue(null),
        EntryDenialReason.NO_MEMBERSHIP,
      ],
      [
        'a frozen membership',
        () =>
          memberships.findRelevantForEntry.mockResolvedValue({
            ...unlimitedMembership,
            status: MembershipStatus.FROZEN,
          }),
        EntryDenialReason.MEMBERSHIP_FROZEN,
      ],
      [
        'an exhausted visit pack',
        () =>
          memberships.findRelevantForEntry.mockResolvedValue({
            ...unlimitedMembership,
            visitLimit: 10,
            visitsUsed: 10,
          }),
        EntryDenialReason.NO_VISITS_LEFT,
      ],
      [
        'a member already inside',
        () => prisma.attendance.findFirst.mockResolvedValue({ id: 'open-1' }),
        EntryDenialReason.ALREADY_INSIDE,
      ],
    ])('refuses %s with its own reason code', async (_label, arrange, reason) => {
      arrange();

      try {
        await service.checkInManually(MEMBER_ID, ADMIN);
        throw new Error('should have refused');
      } catch (error) {
        expect(reasonOf(error)).toBe(reason);
      }

      expect(prisma.attendance.create).not.toHaveBeenCalled();
      expect(memberships.consumeVisit).not.toHaveBeenCalled();
    });

    it('reports a concurrent double check-in as already inside', async () => {
      // Both requests pass the application check; the partial unique index
      // rejects the second insert.
      prisma.attendance.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.0.0',
        }),
      );

      try {
        await service.checkInManually(MEMBER_ID, ADMIN);
        throw new Error('should have refused');
      } catch (error) {
        expect(reasonOf(error)).toBe(EntryDenialReason.ALREADY_INSIDE);
      }
    });

    it('rethrows an unrelated database error rather than masking it', async () => {
      prisma.attendance.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.checkInManually(MEMBER_ID, ADMIN)).rejects.toThrow('connection lost');
    });
  });

  describe('QR check-in', () => {
    const token = () => buildCardToken({ memberId: MEMBER_ID, version: 1 }, SECRET);

    it('admits a valid current card and stamps its last use', async () => {
      const outcome = await service.checkInByCard(token(), ADMIN);

      expect(outcome.attendance).toBeDefined();
      expect(cards.markUsed).toHaveBeenCalledWith(prisma, MEMBER_ID, expect.any(Date));
      const data = prisma.attendance.create.mock.calls[0][0].data as { method: CheckInMethod };
      expect(data.method).toBe(CheckInMethod.QR);
    });

    it('refuses a forged signature without touching the database', async () => {
      try {
        await service.checkInByCard(`${token().slice(0, -4)}dead`, ADMIN);
        throw new Error('should have refused');
      } catch (error) {
        expect(reasonOf(error)).toBe(EntryDenialReason.CARD_INVALID);
      }

      expect(cards.findByMemberId).not.toHaveBeenCalled();
    });

    it('refuses a QR from another system', async () => {
      try {
        await service.checkInByCard('OTHER.abc.1.xyz', ADMIN);
        throw new Error('should have refused');
      } catch (error) {
        expect(reasonOf(error)).toBe(EntryDenialReason.CARD_INVALID);
      }
    });

    it('refuses a card for a member who has none issued', async () => {
      cards.findByMemberId.mockResolvedValue(null);

      try {
        await service.checkInByCard(token(), ADMIN);
        throw new Error('should have refused');
      } catch (error) {
        expect(reasonOf(error)).toBe(EntryDenialReason.CARD_NOT_ISSUED);
      }
    });

    it('refuses a revoked card', async () => {
      cards.findByMemberId.mockResolvedValue({
        memberId: MEMBER_ID,
        version: 1,
        revokedAt: new Date(),
      });

      try {
        await service.checkInByCard(token(), ADMIN);
        throw new Error('should have refused');
      } catch (error) {
        expect(reasonOf(error)).toBe(EntryDenialReason.CARD_REVOKED);
      }
    });

    it('refuses a superseded card after a regeneration', async () => {
      cards.findByMemberId.mockResolvedValue({ memberId: MEMBER_ID, version: 3, revokedAt: null });

      try {
        await service.checkInByCard(token(), ADMIN);
        throw new Error('should have refused');
      } catch (error) {
        expect(reasonOf(error)).toBe(EntryDenialReason.CARD_SUPERSEDED);
      }
    });

    it('applies the same membership rules as a manual check-in', async () => {
      memberships.findRelevantForEntry.mockResolvedValue({
        ...unlimitedMembership,
        status: MembershipStatus.EXPIRED,
      });

      try {
        await service.checkInByCard(token(), ADMIN);
        throw new Error('should have refused');
      } catch (error) {
        expect(reasonOf(error)).toBe(EntryDenialReason.MEMBERSHIP_EXPIRED);
      }
    });
  });

  describe('check-out', () => {
    it('closes the open visit', async () => {
      prisma.attendance.findFirst.mockResolvedValue({ id: 'open-1' });

      await service.checkOutMember(MEMBER_ID);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'open-1' },
          data: { checkedOutAt: expect.any(Date) },
        }),
      );
    });

    it('refuses when the member is not inside', async () => {
      prisma.attendance.findFirst.mockResolvedValue(null);

      await expect(service.checkOutMember(MEMBER_ID)).rejects.toMatchObject({
        errorCode: 'CONFLICT',
      });
    });

    it('refuses to close a visit that is already closed', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        memberId: MEMBER_ID,
        checkedOutAt: new Date(),
      });

      await expect(service.checkOutById('att-1')).rejects.toMatchObject({
        errorCode: 'CONFLICT',
      });
    });

    it('lets a revoked card still close a visit, so nobody is trapped inside', async () => {
      cards.findByMemberId.mockResolvedValue({
        memberId: MEMBER_ID,
        version: 1,
        revokedAt: new Date(),
      });
      prisma.attendance.findFirst.mockResolvedValue({ id: 'open-1' });

      await expect(
        service.checkOutByCard(buildCardToken({ memberId: MEMBER_ID, version: 1 }, SECRET)),
      ).resolves.toBeDefined();
    });

    it('still refuses an unparseable card on the way out', async () => {
      try {
        await service.checkOutByCard('nonsense');
        throw new Error('should have refused');
      } catch (error) {
        expect(reasonOf(error)).toBe(EntryDenialReason.CARD_INVALID);
      }
    });
  });

  describe('scoping', () => {
    function filters(): Record<string, unknown>[] {
      return prisma.attendance.findMany.mock.calls[0][0].where.AND as Record<string, unknown>[];
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

    it('restricts a member to their own visits', async () => {
      await service.findMany(query(), principal(UserRole.MEMBER));
      expect(filters()[0]).toEqual({ member: { userId: 'user-1' } });
    });

    it('reports an out-of-scope visit as not found', async () => {
      prisma.attendance.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneScoped('att-9', principal(UserRole.TRAINER)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });

    it('includes the whole of the `to` day', async () => {
      await service.findMany(query({ to: '2026-10-31' }), principal(UserRole.ADMIN));

      const dateFilter = filters().find((f) => 'checkedInAt' in f) as {
        checkedInAt: { lt: Date };
      };
      expect(dateFilter.checkedInAt.lt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });
  });

  describe('forDay', () => {
    it('bounds the query to the calendar day and counts who is inside', async () => {
      prisma.$transaction.mockResolvedValue([[], 7]);

      const result = await service.forDay(new Date('2026-10-15T18:30:00.000Z'));

      expect(result.date).toBe('2026-10-15');
      expect(result.currentlyInside).toBe(7);
    });
  });
});
