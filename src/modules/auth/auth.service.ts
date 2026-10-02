import { Injectable, Logger } from '@nestjs/common';
import { UserStatus, type User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/configuration';
import { UsersService } from '../users/users.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { PasswordService } from './password.service';
import { TokenService, type RefreshTokenContext } from './token.service';
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../../common/errors/app.exception';
import type { LoginDto } from './dto/login.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type {
  ForgotPasswordResponseDto,
  LoginResponseDto,
  MessageResponseDto,
} from './dto/auth-response.dto';

/** Identical message for every login failure — see `login()`. */
const INVALID_CREDENTIALS = 'Invalid email or password';
const ACCOUNT_INACTIVE = 'This account is inactive. Contact an administrator.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * A wrong password and an unknown email produce the same message and take
   * comparable time, so login cannot be used to enumerate accounts. An
   * inactive account is told so explicitly — only after its password checks
   * out, so that fact is not leaked to an attacker.
   */
  async login(dto: LoginDto, context: RefreshTokenContext = {}): Promise<LoginResponseDto> {
    const user = await this.users.findByEmail(dto.email);

    if (!user) {
      await this.passwords.burnTiming();
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    if (!(await this.passwords.verify(dto.password, user.passwordHash))) {
      this.logger.warn(`Failed login for ${user.email}`);
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    if (user.status !== UserStatus.ACTIVE) {
      this.logger.warn(`Login refused for inactive account ${user.email}`);
      throw new ForbiddenError(ACCOUNT_INACTIVE);
    }

    await this.users.recordLogin(user.id);
    this.logger.log(`User ${user.email} (${user.role}) logged in`);

    return this.buildLoginResponse(user, context);
  }

  /**
   * Rotates the presented refresh token. Presenting a token that was already
   * rotated or revoked is treated as a stolen-token replay: every session for
   * that user is terminated.
   */
  async refresh(rawToken: string, context: RefreshTokenContext = {}): Promise<LoginResponseDto> {
    const record = await this.tokens.findRefreshToken(rawToken);

    if (!record) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (!TokenService.isRefreshTokenUsable(record)) {
      if (record.revokedAt !== null) {
        // A token that was revoked *by rotation* (it has a successor) and is
        // then presented again means someone holds a copy they should not:
        // the legitimate client already moved on to the successor. Kill the
        // whole family. A token revoked by an explicit logout carries no
        // successor and is simply rejected — logging out of one device must
        // not end the user's other sessions.
        if (record.replacedById !== null) {
          this.logger.warn(
            `Refresh token reuse detected for user ${record.userId}; revoking all sessions`,
          );
          await this.tokens.revokeAllForUser(record.userId);
        }
        throw new UnauthorizedError('Refresh token has been revoked');
      }
      throw new UnauthorizedError('Refresh token has expired');
    }

    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (user.status !== UserStatus.ACTIVE) {
      await this.tokens.revokeAllForUser(user.id);
      throw new ForbiddenError(ACCOUNT_INACTIVE);
    }

    const rotated = await this.tokens.rotateRefreshToken(record, context);

    return {
      accessToken: await this.tokens.issueAccessToken(user),
      refreshToken: rotated.token,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTokenTtlSeconds,
      user: UserResponseDto.fromEntity(user),
    };
  }

  /**
   * Ends the session the refresh token belongs to. Succeeds even for an
   * unknown or already-revoked token so logout is idempotent, but refuses to
   * revoke a token belonging to a different user.
   */
  async logout(userId: string, rawToken: string): Promise<MessageResponseDto> {
    const record = await this.tokens.findRefreshToken(rawToken);

    if (record && record.userId !== userId) {
      throw new ForbiddenError('This refresh token does not belong to the current user');
    }

    if (record) {
      await this.tokens.revokeRefreshToken(record.id);
    }

    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string): Promise<MessageResponseDto> {
    const count = await this.tokens.revokeAllForUser(userId);
    return { message: `Logged out of ${count} session(s)` };
  }

  /** Changing a password ends every other session. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<MessageResponseDto> {
    const user = await this.users.findByIdOrFail(userId);

    if (!(await this.passwords.verify(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new ValidationError('The new password must differ from the current password', [
        { field: 'newPassword', messages: ['must differ from the current password'] },
      ]);
    }

    await this.users.updatePasswordHash(userId, await this.passwords.hash(dto.newPassword));
    await this.tokens.revokeAllForUser(userId);
    this.logger.log(`Password changed for ${user.email}; all sessions revoked`);

    return { message: 'Password changed successfully. Please sign in again.' };
  }

  /**
   * Always reports success, whether or not the address is registered, so the
   * endpoint cannot be used to discover accounts.
   *
   * There is no mail transport yet (Phase 9 owns notifications), so outside
   * production the raw token is returned in the response to keep the flow
   * usable and testable. In production it is only ever written to the log.
   */
  async forgotPassword(email: string): Promise<ForgotPasswordResponseDto> {
    const generic: ForgotPasswordResponseDto = {
      message: 'If that email address has an account, a password reset link has been sent.',
    };

    const user = await this.users.findByEmail(email);
    if (!user || user.status !== UserStatus.ACTIVE) {
      return generic;
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.config.passwordResetExpiresInMinutes * 60 * 1000);

    // Only one reset request may be outstanding per user.
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: TokenService.hashToken(token), expiresAt },
      }),
    ]);

    this.logger.log(
      `Password reset token issued for ${user.email} (expires ${expiresAt.toISOString()})`,
    );

    return this.config.isProduction ? generic : { ...generic, resetToken: token };
  }

  /** Consumes a reset token, sets the new password and ends every session. */
  async resetPassword(dto: ResetPasswordDto): Promise<MessageResponseDto> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: TokenService.hashToken(dto.token) },
    });

    if (!record || record.usedAt !== null) {
      throw new UnauthorizedError('Invalid or already used password reset token');
    }

    if (record.expiresAt <= new Date()) {
      throw new UnauthorizedError('Password reset token has expired');
    }

    const user = await this.users.findByIdOrFail(record.userId);
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenError(ACCOUNT_INACTIVE);
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.logger.log(`Password reset completed for ${user.email}; all sessions revoked`);

    return { message: 'Password reset successfully. Please sign in with your new password.' };
  }

  private async buildLoginResponse(
    user: User,
    context: RefreshTokenContext,
  ): Promise<LoginResponseDto> {
    const [accessToken, refresh] = await Promise.all([
      this.tokens.issueAccessToken(user),
      this.tokens.issueRefreshToken(user.id, context),
    ]);

    return {
      accessToken,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTokenTtlSeconds,
      user: UserResponseDto.fromEntity(user),
    };
  }
}
