import type { UserRole, UserStatus } from '@prisma/client';

/**
 * The authenticated principal attached to `request.user` by JwtAuthGuard.
 * Deliberately minimal — anything beyond identity and authorization must be
 * loaded from the database by the handler that needs it.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

/** Claims carried by an access token. */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  email: string;
  role: UserRole;
  /** Discriminator so a token of another kind can never be used as an access token. */
  type: 'access';
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by JwtAuthGuard on authenticated requests. */
    user?: AuthenticatedUser;
  }
}
