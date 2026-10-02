import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Marks a route as reachable without authentication.
 * Authentication is on by default (JwtAuthGuard is registered globally), so a
 * route is only ever public when it opts out explicitly.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
