import { UserRole, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PasswordService } from '../auth/password.service';

describe('UsersService.normalizeEmail', () => {
  it.each([
    ['Admin@Gym.Local', 'admin@gym.local'],
    ['  spaced@gym.local  ', 'spaced@gym.local'],
    ['MIXED@CASE.COM', 'mixed@case.com'],
  ])('normalizes %s', (input, expected) => {
    expect(UsersService.normalizeEmail(input)).toBe(expected);
  });
});

describe('UsersService', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let passwords: { hash: jest.Mock };
  let service: UsersService;

  const baseDto = {
    email: 'New@Gym.Local',
    password: 'StrongPass123',
    role: UserRole.TRAINER,
    firstName: '  Tina ',
    lastName: ' Trainer ',
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };
    passwords = { hash: jest.fn().mockResolvedValue('hashed-password') };

    service = new UsersService(
      prisma as unknown as PrismaService,
      passwords as unknown as PasswordService,
    );
  });

  describe('create', () => {
    it('stores the email lower-cased and the name trimmed', async () => {
      const created = (await service.create(baseDto)) as unknown as Record<string, unknown>;

      expect(created.email).toBe('new@gym.local');
      expect(created.firstName).toBe('Tina');
      expect(created.lastName).toBe('Trainer');
    });

    it('stores a hash, never the plaintext password', async () => {
      const created = (await service.create(baseDto)) as unknown as Record<string, unknown>;

      expect(passwords.hash).toHaveBeenCalledWith('StrongPass123');
      expect(created.passwordHash).toBe('hashed-password');
      expect(created).not.toHaveProperty('password');
    });

    it('defaults a new account to ACTIVE', async () => {
      const created = (await service.create(baseDto)) as unknown as Record<string, unknown>;
      expect(created.status).toBe(UserStatus.ACTIVE);
    });

    it('honours an explicit INACTIVE status', async () => {
      const created = (await service.create({
        ...baseDto,
        status: UserStatus.INACTIVE,
      })) as unknown as Record<string, unknown>;

      expect(created.status).toBe(UserStatus.INACTIVE);
    });

    it('rejects a duplicate email with a field-level conflict', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(baseDto)).rejects.toMatchObject({
        errorCode: 'CONFLICT',
        details: [{ field: 'email', messages: ['must be unique'] }],
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('detects a duplicate regardless of the email casing used', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create({ ...baseDto, email: 'NEW@GYM.LOCAL' })).rejects.toThrow();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'new@gym.local' },
        select: { id: true },
      });
    });
  });

  describe('findByIdOrFail', () => {
    it('throws a 404-shaped error for a missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findByIdOrFail('missing')).rejects.toThrow(/User 'missing' not found/);
    });
  });

  describe('findMany', () => {
    it('filters by role and status and paginates', async () => {
      prisma.$transaction.mockResolvedValue([[{ id: 'u1' }], 1]);

      const result = await service.findMany({
        page: 2,
        limit: 10,
        skip: 10,
        take: 10,
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: UserRole.MEMBER, status: UserStatus.ACTIVE },
          skip: 10,
          take: 10,
        }),
      );
      expect(result.meta).toEqual(
        expect.objectContaining({ page: 2, limit: 10, total: 1, totalPages: 1 }),
      );
    });

    it('searches email and name case-insensitively', async () => {
      await service.findMany({ page: 1, limit: 20, skip: 0, take: 20, search: 'ada' });

      const where = prisma.user.findMany.mock.calls[0][0].where as { OR: unknown[] };
      expect(where.OR).toHaveLength(3);
      expect(JSON.stringify(where.OR)).toContain('insensitive');
    });

    it('applies no filter when none is supplied', async () => {
      await service.findMany({ page: 1, limit: 20, skip: 0, take: 20 });

      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({});
    });
  });
});
