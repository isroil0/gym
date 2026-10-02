import { UserRole, UserStatus, type RefreshToken, type User } from '@prisma/client';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import type { PasswordService } from './password.service';
import type { UsersService } from '../users/users.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppConfigService } from '../../config/configuration';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'member@gym.test',
    passwordHash: 'hashed',
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    firstName: 'Mia',
    lastName: 'Member',
    phone: null,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRefresh(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'rt-1',
    userId: 'user-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    ipAddress: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: {
    $transaction: jest.Mock;
    passwordResetToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
    };
    user: { update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
  };
  let users: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    recordLogin: jest.Mock;
    updatePasswordHash: jest.Mock;
  };
  let passwords: { verify: jest.Mock; hash: jest.Mock; burnTiming: jest.Mock };
  let tokens: {
    issueAccessToken: jest.Mock;
    issueRefreshToken: jest.Mock;
    findRefreshToken: jest.Mock;
    rotateRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
    revokeAllForUser: jest.Mock;
    accessTokenTtlSeconds: number;
  };
  let config: { isProduction: boolean; passwordResetExpiresInMinutes: number };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      user: { update: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
    };
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
      recordLogin: jest.fn().mockResolvedValue(undefined),
      updatePasswordHash: jest.fn().mockResolvedValue(undefined),
    };
    passwords = {
      verify: jest.fn(),
      hash: jest.fn().mockResolvedValue('new-hash'),
      burnTiming: jest.fn().mockResolvedValue(undefined),
    };
    tokens = {
      issueAccessToken: jest.fn().mockResolvedValue('access-token'),
      issueRefreshToken: jest
        .fn()
        .mockResolvedValue({ token: 'refresh-token', record: makeRefresh() }),
      findRefreshToken: jest.fn(),
      rotateRefreshToken: jest
        .fn()
        .mockResolvedValue({ token: 'rotated-token', record: makeRefresh() }),
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(2),
      accessTokenTtlSeconds: 900,
    };
    config = { isProduction: false, passwordResetExpiresInMinutes: 60 };

    service = new AuthService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
      passwords as unknown as PasswordService,
      tokens as unknown as TokenService,
      config as AppConfigService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('login', () => {
    it('returns a token pair and the user on valid credentials', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      passwords.verify.mockResolvedValue(true);

      const result = await service.login({ email: 'member@gym.test', password: 'good' });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresIn).toBe(900);
      expect(result.user.email).toBe('member@gym.test');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('records the login timestamp', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      passwords.verify.mockResolvedValue(true);

      await service.login({ email: 'member@gym.test', password: 'good' });

      expect(users.recordLogin).toHaveBeenCalledWith('user-1');
    });

    it('reports an unknown email exactly like a wrong password', async () => {
      users.findByEmail.mockResolvedValue(null);
      const unknownEmail = service.login({ email: 'nobody@gym.test', password: 'x' });
      await expect(unknownEmail).rejects.toThrow('Invalid email or password');

      users.findByEmail.mockResolvedValue(makeUser());
      passwords.verify.mockResolvedValue(false);
      const wrongPassword = service.login({ email: 'member@gym.test', password: 'x' });
      await expect(wrongPassword).rejects.toThrow('Invalid email or password');
    });

    it('burns comparable time when the account does not exist', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(service.login({ email: 'nobody@gym.test', password: 'x' })).rejects.toThrow();
      expect(passwords.burnTiming).toHaveBeenCalledTimes(1);
    });

    it('refuses an inactive account, but only after the password checks out', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ status: UserStatus.INACTIVE }));
      passwords.verify.mockResolvedValue(true);

      await expect(service.login({ email: 'member@gym.test', password: 'good' })).rejects.toThrow(
        /account is inactive/,
      );
      expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
    });

    it('does not reveal that an inactive account exists when the password is wrong', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ status: UserStatus.INACTIVE }));
      passwords.verify.mockResolvedValue(false);

      await expect(service.login({ email: 'member@gym.test', password: 'bad' })).rejects.toThrow(
        'Invalid email or password',
      );
    });
  });

  describe('refresh', () => {
    it('rotates the token and issues a new pair', async () => {
      tokens.findRefreshToken.mockResolvedValue(makeRefresh());
      users.findById.mockResolvedValue(makeUser());

      const result = await service.refresh('raw-token');

      expect(tokens.rotateRefreshToken).toHaveBeenCalledTimes(1);
      expect(result.refreshToken).toBe('rotated-token');
      expect(result.accessToken).toBe('access-token');
    });

    it('rejects an unknown token', async () => {
      tokens.findRefreshToken.mockResolvedValue(null);
      await expect(service.refresh('nope')).rejects.toThrow('Invalid refresh token');
    });

    it('rejects an expired token without revoking the other sessions', async () => {
      tokens.findRefreshToken.mockResolvedValue(
        makeRefresh({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.refresh('stale')).rejects.toThrow('Refresh token has expired');
      expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('treats replay of a rotated token as a compromise and kills every session', async () => {
      tokens.findRefreshToken.mockResolvedValue(
        makeRefresh({ revokedAt: new Date(), replacedById: 'rt-2' }),
      );

      await expect(service.refresh('replayed')).rejects.toThrow('Refresh token has been revoked');
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('rejects a logged-out token without touching the other sessions', async () => {
      // Revoked by logout, so it has no successor.
      tokens.findRefreshToken.mockResolvedValue(
        makeRefresh({ revokedAt: new Date(), replacedById: null }),
      );

      await expect(service.refresh('logged-out')).rejects.toThrow('Refresh token has been revoked');
      expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects and revokes when the account was deactivated mid-session', async () => {
      tokens.findRefreshToken.mockResolvedValue(makeRefresh());
      users.findById.mockResolvedValue(makeUser({ status: UserStatus.INACTIVE }));

      await expect(service.refresh('raw-token')).rejects.toThrow(/account is inactive/);
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('rejects a token whose user has been deleted', async () => {
      tokens.findRefreshToken.mockResolvedValue(makeRefresh());
      users.findById.mockResolvedValue(null);

      await expect(service.refresh('raw-token')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('logout', () => {
    it('revokes the presented token', async () => {
      tokens.findRefreshToken.mockResolvedValue(makeRefresh());

      await service.logout('user-1', 'raw-token');

      expect(tokens.revokeRefreshToken).toHaveBeenCalledWith('rt-1');
    });

    it('is idempotent for an unknown token', async () => {
      tokens.findRefreshToken.mockResolvedValue(null);

      await expect(service.logout('user-1', 'gone')).resolves.toEqual({
        message: 'Logged out successfully',
      });
      expect(tokens.revokeRefreshToken).not.toHaveBeenCalled();
    });

    it("refuses to revoke another user's token", async () => {
      tokens.findRefreshToken.mockResolvedValue(makeRefresh({ userId: 'someone-else' }));

      await expect(service.logout('user-1', 'raw-token')).rejects.toThrow(
        /does not belong to the current user/,
      );
      expect(tokens.revokeRefreshToken).not.toHaveBeenCalled();
    });

    it('logoutAll revokes every session', async () => {
      await expect(service.logoutAll('user-1')).resolves.toEqual({
        message: 'Logged out of 2 session(s)',
      });
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('changePassword', () => {
    const dto = { currentPassword: 'OldPass123', newPassword: 'NewPass456' };

    it('rehashes the password and ends every session', async () => {
      users.findByIdOrFail.mockResolvedValue(makeUser());
      passwords.verify.mockResolvedValue(true);

      await service.changePassword('user-1', dto);

      expect(passwords.hash).toHaveBeenCalledWith('NewPass456');
      expect(users.updatePasswordHash).toHaveBeenCalledWith('user-1', 'new-hash');
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('rejects a wrong current password', async () => {
      users.findByIdOrFail.mockResolvedValue(makeUser());
      passwords.verify.mockResolvedValue(false);

      await expect(service.changePassword('user-1', dto)).rejects.toThrow(
        'Current password is incorrect',
      );
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password', async () => {
      users.findByIdOrFail.mockResolvedValue(makeUser());
      passwords.verify.mockResolvedValue(true);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'Same12345',
          newPassword: 'Same12345',
        }),
      ).rejects.toThrow(/must differ from the current password/);
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('issues a token for an active account', async () => {
      users.findByEmail.mockResolvedValue(makeUser());

      const result = await service.forgotPassword('member@gym.test');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.resetToken).toHaveLength(64);
    });

    it('answers identically for an unknown address and issues nothing', async () => {
      users.findByEmail.mockResolvedValue(null);

      const unknown = await service.forgotPassword('nobody@gym.test');

      users.findByEmail.mockResolvedValue(makeUser());
      const known = await service.forgotPassword('member@gym.test');

      expect(unknown.message).toBe(known.message);
      expect(unknown.resetToken).toBeUndefined();
    });

    it('issues nothing for an inactive account', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ status: UserStatus.INACTIVE }));

      const result = await service.forgotPassword('member@gym.test');

      expect(result.resetToken).toBeUndefined();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('never returns the raw token in production', async () => {
      config.isProduction = true;
      users.findByEmail.mockResolvedValue(makeUser());

      const result = await service.forgotPassword('member@gym.test');

      expect(result.resetToken).toBeUndefined();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetPassword', () => {
    const dto = { token: 'raw-reset-token', newPassword: 'BrandNew123' };

    function resetRecord(overrides: Record<string, unknown> = {}) {
      return {
        id: 'prt-1',
        userId: 'user-1',
        tokenHash: TokenService.hashToken(dto.token),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
        ...overrides,
      };
    }

    it('sets the new password, consumes the token and ends every session', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord());
      users.findByIdOrFail.mockResolvedValue(makeUser());

      await service.resetPassword(dto);

      expect(passwords.hash).toHaveBeenCalledWith('BrandNew123');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('looks the token up by hash, never by its raw value', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord());
      users.findByIdOrFail.mockResolvedValue(makeUser());

      await service.resetPassword(dto);

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: TokenService.hashToken(dto.token) },
      });
    });

    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword(dto)).rejects.toThrow(/Invalid or already used/);
    });

    it('rejects an already used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord({ usedAt: new Date() }));
      await expect(service.resetPassword(dto)).rejects.toThrow(/Invalid or already used/);
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        resetRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.resetPassword(dto)).rejects.toThrow(/has expired/);
    });

    it('rejects a token for an account that was deactivated meanwhile', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord());
      users.findByIdOrFail.mockResolvedValue(makeUser({ status: UserStatus.INACTIVE }));

      await expect(service.resetPassword(dto)).rejects.toThrow(/account is inactive/);
    });
  });
});
