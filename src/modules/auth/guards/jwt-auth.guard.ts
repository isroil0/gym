import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { ForbiddenError, UnauthorizedError } from '../../../common/errors/app.exception';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenService } from '../token.service';

/**
 * Authenticates every request unless the route is marked @Public().
 *
 * Registered globally, so a new controller is protected by default and a
 * developer has to opt out deliberately rather than remember to opt in.
 *
 * The account is re-read from the database on each request: an access token
 * stays valid for its full lifetime, so deactivating or deleting an account
 * must take effect immediately rather than when the token happens to expire.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = JwtAuthGuard.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    let userId: string;
    try {
      userId = (await this.tokens.verifyAccessToken(token)).sub;
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user) {
      this.logger.warn(`Access token presented for unknown user ${userId}`);
      throw new UnauthorizedError('Invalid or expired access token');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenError('This account is inactive. Contact an administrator.');
    }

    request.user = user;
    return true;
  }

  private static extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;

    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) return null;

    return value.trim() || null;
  }
}
