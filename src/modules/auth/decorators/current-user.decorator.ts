import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Injects the authenticated principal, or one of its fields:
 *   `@CurrentUser() user: AuthenticatedUser`
 *   `@CurrentUser('id') userId: string`
 *
 * Only usable on routes behind JwtAuthGuard; it throws rather than returning
 * undefined so a missing guard surfaces immediately instead of silently
 * handing a handler an anonymous request.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new Error(
        '@CurrentUser() used on a route without authentication. ' +
          'Remove @Public() or attach JwtAuthGuard.',
      );
    }

    return field ? user[field] : user;
  },
);
