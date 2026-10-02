import { MembershipCardsService } from './membership-cards.service';
import { parseCardToken } from './membership-card-token';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppConfigService } from '../../config/configuration';
import type { MembersService } from '../members/members.service';

const SECRET = 'a-test-qr-secret-that-is-long-enough-32';
const MEMBER_ID = '0b5f8a2e-1111-4000-8000-000000000001';

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    memberId: MEMBER_ID,
    version: 1,
    issuedAt: new Date(),
    revokedAt: null,
    revokedReason: null,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('MembershipCardsService', () => {
  let prisma: {
    membershipCard: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let members: { findOneOrFail: jest.Mock; findByUserIdOrFail: jest.Mock };
  let service: MembershipCardsService;

  const memberRecord = {
    id: MEMBER_ID,
    memberNumber: 42,
    user: { firstName: 'Mia', lastName: 'Member' },
  };

  beforeEach(() => {
    prisma = {
      membershipCard: {
        findUnique: jest.fn().mockResolvedValue(makeCard()),
        create: jest.fn().mockResolvedValue(makeCard()),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve(makeCard({ version: 2, ...data })),
          ),
      },
    };
    members = {
      findOneOrFail: jest.fn().mockResolvedValue(memberRecord),
      findByUserIdOrFail: jest.fn().mockResolvedValue(memberRecord),
    };

    service = new MembershipCardsService(
      prisma as unknown as PrismaService,
      { qrSecret: SECRET } as AppConfigService,
      members as unknown as MembersService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('tokenFor', () => {
    it('derives a token that verifies against the same secret', () => {
      const token = service.tokenFor(makeCard({ version: 4 }));

      expect(parseCardToken(token, SECRET)).toEqual({
        ok: true,
        payload: { memberId: MEMBER_ID, version: 4 },
      });
    });

    it('is stable, so a member can re-open their card', () => {
      const card = makeCard();
      expect(service.tokenFor(card)).toBe(service.tokenFor(card));
    });
  });

  describe('ensureForMember', () => {
    it('returns the existing card without creating another', async () => {
      await service.ensureForMember(MEMBER_ID);

      expect(prisma.membershipCard.create).not.toHaveBeenCalled();
    });

    it('issues a card on first request', async () => {
      prisma.membershipCard.findUnique.mockResolvedValue(null);

      await service.ensureForMember(MEMBER_ID);

      expect(prisma.membershipCard.create).toHaveBeenCalledWith({
        data: { memberId: MEMBER_ID },
      });
    });

    it('rejects an unknown member', async () => {
      members.findOneOrFail.mockRejectedValue(new Error('not found'));

      await expect(service.ensureForMember('ghost')).rejects.toThrow();
    });
  });

  describe('regenerate', () => {
    it('bumps the version and clears any revocation', async () => {
      await service.regenerate(MEMBER_ID);

      const data = prisma.membershipCard.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.version).toEqual({ increment: 1 });
      expect(data.revokedAt).toBeNull();
      expect(data.revokedReason).toBeNull();
      expect(data.issuedAt).toBeInstanceOf(Date);
    });

    it('produces a token that differs from the previous version', async () => {
      const before = service.tokenFor(makeCard({ version: 1 }));
      const { card } = await service.regenerate(MEMBER_ID);

      expect(service.tokenFor(card)).not.toBe(before);
    });
  });

  describe('revoke', () => {
    it('stamps the revocation with its reason', async () => {
      await service.revoke(MEMBER_ID, 'Card shared');

      const data = prisma.membershipCard.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.revokedAt).toBeInstanceOf(Date);
      expect(data.revokedReason).toBe('Card shared');
    });

    it('refuses to revoke twice', async () => {
      prisma.membershipCard.findUnique.mockResolvedValue(makeCard({ revokedAt: new Date() }));

      await expect(service.revoke(MEMBER_ID)).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });
  });

  describe('present', () => {
    it('includes the member code and name alongside the token', async () => {
      const loaded = await service.ensureForMember(MEMBER_ID);
      const dto = service.present(loaded);

      expect(dto.memberCode).toBe('M-000042');
      expect(dto.memberName).toBe('Mia Member');
      expect(dto.active).toBe(true);
      expect(dto.token.startsWith('GYM1.')).toBe(true);
    });

    it('reports a revoked card as inactive', async () => {
      prisma.membershipCard.findUnique.mockResolvedValue(
        makeCard({ revokedAt: new Date(), revokedReason: 'Lost' }),
      );

      const dto = service.present(await service.ensureForMember(MEMBER_ID));

      expect(dto.active).toBe(false);
      expect(dto.revokedReason).toBe('Lost');
    });
  });

  describe('requireCard', () => {
    it('explains when a member has no card', async () => {
      prisma.membershipCard.findUnique.mockResolvedValue(null);

      await expect(service.requireCard(MEMBER_ID)).rejects.toMatchObject({
        errorCode: 'NOT_FOUND',
      });
    });
  });
});
