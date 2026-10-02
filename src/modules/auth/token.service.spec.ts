import { JwtService } from '@nestjs/jwt';
import type { RefreshToken } from '@prisma/client';
import { TokenService } from './token.service';
import type { AppConfigService } from '../../config/configuration';
import type { PrismaService } from '../../prisma/prisma.service';

const config = {
  jwtSecret: 'a-test-secret-that-is-at-least-32-characters-long',
  jwtAccessExpiresIn: '15m',
  jwtIssuer: 'gym-crm',
  jwtAudience: 'gym-crm-api',
  refreshTokenExpiresInDays: 30,
} as AppConfigService;

function makeService(prisma: Partial<PrismaService> = {}) {
  return new TokenService(new JwtService(), prisma as PrismaService, config);
}

function refreshRecord(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'token-1',
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

describe('TokenService.hashToken', () => {
  it('is deterministic', () => {
    expect(TokenService.hashToken('abc')).toBe(TokenService.hashToken('abc'));
  });

  it('differs for different inputs and never returns the raw token', () => {
    const hash = TokenService.hashToken('abc');
    expect(hash).not.toBe(TokenService.hashToken('abd'));
    expect(hash).not.toContain('abc');
    expect(hash).toHaveLength(64);
  });
});

describe('TokenService.durationToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604800],
  ])('converts %s to %i seconds', (input, expected) => {
    expect(TokenService.durationToSeconds(input)).toBe(expected);
  });
});

describe('TokenService.isRefreshTokenUsable', () => {
  it('accepts a live token', () => {
    expect(TokenService.isRefreshTokenUsable(refreshRecord())).toBe(true);
  });

  it('rejects a revoked token', () => {
    expect(TokenService.isRefreshTokenUsable(refreshRecord({ revokedAt: new Date() }))).toBe(false);
  });

  it('rejects an expired token', () => {
    const expired = refreshRecord({ expiresAt: new Date(Date.now() - 1000) });
    expect(TokenService.isRefreshTokenUsable(expired)).toBe(false);
  });
});

describe('TokenService access tokens', () => {
  const service = makeService();
  const user = { id: 'user-1', email: 'a@gym.test', role: 'ADMIN' as const };

  it('round-trips the claims it signs', async () => {
    const token = await service.issueAccessToken(user);
    const payload = await service.verifyAccessToken(token);

    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@gym.test');
    expect(payload.role).toBe('ADMIN');
    expect(payload.type).toBe('access');
    expect(payload.iss).toBe('gym-crm');
    expect(payload.aud).toBe('gym-crm-api');
  });

  it('never embeds a password hash', async () => {
    const token = await service.issueAccessToken(user);
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<
      string,
      unknown
    >;

    expect(Object.keys(claims)).toEqual(
      expect.not.arrayContaining(['passwordHash', 'password', 'status']),
    );
  });

  it('rejects a token signed with another secret', async () => {
    const foreign = new TokenService(
      new JwtService(),
      {} as PrismaService,
      {
        ...config,
        jwtSecret: 'a-completely-different-secret-of-sufficient-length',
      } as AppConfigService,
    );
    const token = await foreign.issueAccessToken(user);

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects a token issued for another audience', async () => {
    const foreign = new TokenService(
      new JwtService(),
      {} as PrismaService,
      {
        ...config,
        jwtAudience: 'some-other-api',
      } as AppConfigService,
    );
    const token = await foreign.issueAccessToken(user);

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects a garbage token', async () => {
    await expect(service.verifyAccessToken('not.a.jwt')).rejects.toThrow();
  });

  it('exposes the lifetime in seconds', () => {
    expect(service.accessTokenTtlSeconds).toBe(900);
  });
});

describe('TokenService refresh tokens', () => {
  it('persists only a hash of the issued token', async () => {
    const create = jest
      .fn()
      .mockImplementation(({ data }: { data: { tokenHash: string } }) =>
        Promise.resolve(refreshRecord({ tokenHash: data.tokenHash })),
      );
    const service = makeService({ refreshToken: { create } } as unknown as PrismaService);

    const issued = await service.issueRefreshToken('user-1', {
      userAgent: 'jest',
      ipAddress: '::1',
    });

    expect(issued.token).toHaveLength(96);
    const persisted = create.mock.calls[0][0].data as { tokenHash: string };
    expect(persisted.tokenHash).toBe(TokenService.hashToken(issued.token));
    expect(persisted.tokenHash).not.toBe(issued.token);
  });

  it('truncates an oversized user agent to the column width', async () => {
    const create = jest.fn().mockResolvedValue(refreshRecord());
    const service = makeService({ refreshToken: { create } } as unknown as PrismaService);

    await service.issueRefreshToken('user-1', { userAgent: 'x'.repeat(400) });

    const data = create.mock.calls[0][0].data as { userAgent: string };
    expect(data.userAgent).toHaveLength(255);
  });
});
