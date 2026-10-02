import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AuditAction } from '../audit/audit.decorator';
import { ThrottleCredentials } from '../../common/security/throttle';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { ScopedAccess } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  ForgotPasswordResponseDto,
  LoginResponseDto,
  MessageResponseDto,
} from './dto/auth-response.dto';
import type { AuthenticatedUser } from './types/authenticated-user';
import type { RefreshTokenContext } from './token.service';

function contextFrom(request: Request): RefreshTokenContext {
  return {
    userAgent: request.headers['user-agent'],
    ipAddress: request.ip,
  };
}

@ApiTags(SWAGGER_TAGS.auth)
@ApiUnauthorizedResponse({ description: 'Authentication failed', type: ApiErrorResponse })
@Controller({ path: 'auth' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @ThrottleCredentials()
  @AuditAction('auth.login')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Returns an access token, a rotating refresh token and the signed-in user. ' +
      'An unknown email and a wrong password are reported identically.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiForbiddenResponse({ description: 'The account is inactive', type: ApiErrorResponse })
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<LoginResponseDto> {
    return this.auth.login(dto, contextFrom(request));
  }

  @Public()
  @ThrottleCredentials()
  @AuditAction('auth.refresh')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new token pair',
    description:
      'The presented refresh token is revoked and replaced. Replaying an ' +
      'already-rotated token revokes every session for that user.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request): Promise<LoginResponseDto> {
    return this.auth.refresh(dto.refreshToken, contextFrom(request));
  }

  @ScopedAccess('Acts on the signed-in account only.')
  @Post('logout')
  @AuditAction('auth.logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Sign out of the current session',
    description: 'Revokes the supplied refresh token. Idempotent.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: MessageResponseDto })
  logout(
    @CurrentUser('id') userId: string,
    @Body() dto: RefreshTokenDto,
  ): Promise<MessageResponseDto> {
    return this.auth.logout(userId, dto.refreshToken);
  }

  @ScopedAccess('Acts on the signed-in account only.')
  @Post('logout-all')
  @AuditAction('auth.logoutAll')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Sign out of every session',
    description: 'Revokes all refresh tokens belonging to the current user.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  logoutAll(@CurrentUser('id') userId: string): Promise<MessageResponseDto> {
    return this.auth.logoutAll(userId);
  }

  @ScopedAccess('Acts on the signed-in account only.')
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'The currently signed-in user' })
  @ApiOkResponse({ type: UserResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.users.findByIdOrFail(user.id));
  }

  @ScopedAccess('Acts on the signed-in account only.')
  @Post('change-password')
  @ThrottleCredentials()
  @AuditAction('auth.changePassword')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Change your own password',
    description: 'Requires the current password. Signs out every session on success.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    return this.auth.changePassword(userId, dto);
  }

  @Public()
  @ThrottleCredentials()
  @AuditAction('auth.forgotPassword')
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset token',
    description:
      'Always reports success so the endpoint cannot be used to discover which ' +
      'email addresses have accounts.',
  })
  @ApiOkResponse({ type: ForgotPasswordResponseDto })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<ForgotPasswordResponseDto> {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @ThrottleCredentials()
  @AuditAction('auth.resetPassword')
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password using a reset token',
    description: 'The token is single use. Every session is signed out on success.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.auth.resetPassword(dto);
  }
}
