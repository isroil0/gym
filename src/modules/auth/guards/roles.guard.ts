import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../../common/errors/app.exception';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces @Roles(...). Runs after JwtAuthGuard, so `request.user` is set for
 * any route that reaches it. A route without @Roles() is open to every
 * authenticated role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<Request>().user;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenError(
        `This action requires one of the following roles: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
