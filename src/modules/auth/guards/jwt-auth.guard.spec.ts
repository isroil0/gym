import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { TokenService } from '../token.service';
import type { PrismaService } from '../../../prisma/prisma.service';

interface RequestShape {
  headers: Record<string, string | undefined>;
  user?: unknown;
}

function contextWith(request: RequestShape): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let verifyAccessToken: jest.Mock;
  let findUnique: jest.Mock;
  let guard: JwtAuthGuard;

  const activeUser = {
    id: 'user-1',
    email: 'a@gym.test',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    verifyAccessToken = jest.fn().mockResolvedValue({ sub: 'user-1', type: 'access' });
    findUnique = jest.fn().mockResolvedValue(activeUser);

    guard = new JwtAuthGuard(
      reflector,
      { verifyAccessToken } as unknown as TokenService,
      { user: { findUnique } } as unknown as PrismaService,
    );
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('lets a @Public() route through without a token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(contextWith({ headers: {} }))).resolves.toBe(true);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('attaches the principal on a valid token', async () => {
    const request: RequestShape = { headers: { authorization: 'Bearer good-token' } };

    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request.user).toEqual(activeUser);
  });

  it('rejects a request with no Authorization header', async () => {
    await expect(guard.canActivate(contextWith({ headers: {} }))).rejects.toThrow(
      /Authentication required/,
    );
  });

  it('rejects a non-bearer Authorization scheme', async () => {
    const request: RequestShape = { headers: { authorization: 'Basic abc123' } };
    await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
      /Authentication required/,
    );
  });

  it('rejects an empty bearer value', async () => {
    const request: RequestShape = { headers: { authorization: 'Bearer ' } };
    await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
      /Authentication required/,
    );
  });

  it('accepts a lower-case bearer scheme', async () => {
    const request: RequestShape = { headers: { authorization: 'bearer good-token' } };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
  });

  it('rejects an invalid or expired token', async () => {
    verifyAccessToken.mockRejectedValue(new Error('jwt expired'));
    const request: RequestShape = { headers: { authorization: 'Bearer stale' } };

    await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
      /Invalid or expired access token/,
    );
  });

  it('rejects a token whose user no longer exists', async () => {
    findUnique.mockResolvedValue(null);
    const request: RequestShape = { headers: { authorization: 'Bearer good-token' } };

    await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
      /Invalid or expired access token/,
    );
  });

  it('rejects a still-valid token belonging to a deactivated account', async () => {
    findUnique.mockResolvedValue({ ...activeUser, status: UserStatus.INACTIVE });
    const request: RequestShape = { headers: { authorization: 'Bearer good-token' } };

    await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
      /This account is inactive/,
    );
  });

  it('re-reads the account on every request rather than trusting the token', async () => {
    const request: RequestShape = { headers: { authorization: 'Bearer good-token' } };
    await guard.canActivate(contextWith(request));

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
  });
});
