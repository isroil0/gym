import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { RefreshToken, User } from '@prisma/client';
import { AppConfigService } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from './types/authenticated-user';

export interface IssuedRefreshToken {
  /** The raw token handed to the client. Never persisted. */
  token: string;
  record: RefreshToken;
}

export interface RefreshTokenContext {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Issues and validates both token kinds.
 *
 * Access tokens are stateless JWTs. Refresh tokens are opaque 48-byte random
 * strings persisted only as a SHA-256 hash, rotated on every use, with reuse
 * of an already-rotated token treated as a compromise.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** SHA-256 is correct here: the input is already high-entropy random. */
  static hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async issueAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.jwtSecret,
      // Seconds, so the signed lifetime and the advertised `expiresIn` of the
      // login response are derived from one value.
      expiresIn: this.accessTokenTtlSeconds,
      issuer: this.config.jwtIssuer,
      audience: this.config.jwtAudience,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.jwtSecret,
      issuer: this.config.jwtIssuer,
      audience: this.config.jwtAudience,
    });

    if (payload.type !== 'access') {
      throw new Error('Token is not an access token');
    }

    return payload;
  }

  async issueRefreshToken(
    userId: string,
    context: RefreshTokenContext = {},
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(48).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.config.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000,
    );

    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: TokenService.hashToken(token),
        expiresAt,
        userAgent: context.userAgent?.slice(0, 255),
        ipAddress: context.ipAddress?.slice(0, 64),
      },
    });

    return { token, record };
  }

  findRefreshToken(rawToken: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash: TokenService.hashToken(rawToken) },
    });
  }

  /** A token is usable only while it is neither revoked nor expired. */
  static isRefreshTokenUsable(record: RefreshToken, now = new Date()): boolean {
    return record.revokedAt === null && record.expiresAt > now;
  }

  /**
   * Atomically revokes the presented token and issues its successor, so a
   * concurrent double-refresh cannot mint two live sessions from one token.
   */
  async rotateRefreshToken(
    current: RefreshToken,
    context: RefreshTokenContext = {},
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(48).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.config.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000,
    );

    const [, created] = await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: TokenService.hashToken(token),
          expiresAt,
          userAgent: context.userAgent?.slice(0, 255),
          ipAddress: context.ipAddress?.slice(0, 64),
        },
      }),
    ]);

    await this.prisma.refreshToken.update({
      where: { id: current.id },
      data: { replacedById: created.id },
    });

    return { token, record: created };
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends every session for a user. Used on logout-all, password change and reset. */
  async revokeAllForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count > 0) {
      this.logger.log(`Revoked ${count} refresh token(s) for user ${userId}`);
    }

    return count;
  }

  /**
   * Access token lifetime in seconds. The env schema guarantees the shape
   * `<number><s|m|h|d>`, so parsing cannot fail here.
   */
  get accessTokenTtlSeconds(): number {
    return TokenService.durationToSeconds(this.config.jwtAccessExpiresIn);
  }

  static durationToSeconds(duration: string): number {
    const amount = Number.parseInt(duration, 10);
    const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[duration.slice(-1)] ?? 1;
    return amount * multiplier;
  }
}
