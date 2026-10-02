import { Prisma, UserRole, type User } from '@prisma/client';
import { AccountProvisioningService } from './account-provisioning.service';
import type { UsersService } from './users.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'someone@gym.test',
    passwordHash: 'hashed',
    role: UserRole.MEMBER,
    status: 'ACTIVE',
    firstName: 'Mia',
    lastName: 'Member',
    phone: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AccountProvisioningService', () => {
  let tx: {
    user: { findUnique: jest.Mock };
    member: { findUnique: jest.Mock };
    trainer: { findUnique: jest.Mock };
  };
  let users: { create: jest.Mock };
  let service: AccountProvisioningService;

  const newAccount = {
    email: 'new@gym.test',
    password: 'StrongPass123',
    firstName: 'New',
    lastName: 'Person',
    phone: '+15550100',
  };

  beforeEach(() => {
    tx = {
      user: { findUnique: jest.fn() },
      member: { findUnique: jest.fn().mockResolvedValue(null) },
      trainer: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    users = { create: jest.fn().mockResolvedValue(makeUser()) };
    service = new AccountProvisioningService(users as unknown as UsersService);
  });

  const client = () => tx as unknown as Prisma.TransactionClient;

  describe('create mode', () => {
    it('creates a MEMBER account for a member profile', async () => {
      await service.resolve(client(), 'member', newAccount);

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@gym.test', role: UserRole.MEMBER }),
        tx,
      );
    });

    it('creates a TRAINER account for a trainer profile', async () => {
      await service.resolve(client(), 'trainer', newAccount);

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.TRAINER }),
        tx,
      );
    });

    it('passes the transaction through so the account rolls back with the profile', async () => {
      await service.resolve(client(), 'member', newAccount);
      expect(users.create.mock.calls[0][1]).toBe(tx);
    });

    it('refuses when neither a userId nor full account details are given', async () => {
      await expect(service.resolve(client(), 'member', { email: 'a@gym.test' })).rejects.toThrow(
        /Provide either userId .* or email, password, firstName and lastName/,
      );
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('link mode', () => {
    it('links an existing account of the right role', async () => {
      const existing = makeUser({ role: UserRole.MEMBER });
      tx.user.findUnique.mockResolvedValue(existing);

      await expect(service.resolve(client(), 'member', { userId: 'user-1' })).resolves.toBe(
        existing,
      );
      expect(users.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown userId', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(service.resolve(client(), 'member', { userId: 'ghost' })).rejects.toThrow(
        /User 'ghost' not found/,
      );
    });

    it('rejects an account whose role does not match the profile', async () => {
      tx.user.findUnique.mockResolvedValue(makeUser({ role: UserRole.ADMIN }));

      await expect(service.resolve(client(), 'member', { userId: 'user-1' })).rejects.toThrow(
        /has role ADMIN; a member profile requires role MEMBER/,
      );
    });

    it('rejects a TRAINER account for a member profile', async () => {
      tx.user.findUnique.mockResolvedValue(makeUser({ role: UserRole.TRAINER }));

      await expect(service.resolve(client(), 'member', { userId: 'user-1' })).rejects.toThrow(
        /requires role MEMBER/,
      );
    });

    it('rejects an account that already has a member profile', async () => {
      tx.user.findUnique.mockResolvedValue(makeUser({ role: UserRole.MEMBER }));
      tx.member.findUnique.mockResolvedValue({ id: 'member-1' });

      await expect(service.resolve(client(), 'member', { userId: 'user-1' })).rejects.toMatchObject(
        { errorCode: 'CONFLICT' },
      );
    });

    it('rejects an account that already has a trainer profile', async () => {
      tx.user.findUnique.mockResolvedValue(makeUser({ role: UserRole.TRAINER }));
      tx.trainer.findUnique.mockResolvedValue({ id: 'trainer-1' });

      await expect(
        service.resolve(client(), 'trainer', { userId: 'user-1' }),
      ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('ignores supplied account fields when linking', async () => {
      tx.user.findUnique.mockResolvedValue(makeUser({ role: UserRole.MEMBER }));

      await service.resolve(client(), 'member', { userId: 'user-1', ...newAccount });

      expect(users.create).not.toHaveBeenCalled();
    });
  });
});
