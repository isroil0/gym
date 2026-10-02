import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'auth:roles';

/**
 * Restricts a route to the given roles. Without this decorator an
 * authenticated user of any role may call the route.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const SCOPED_ACCESS_KEY = 'auth:scopedAccess';

/**
 * Marks a route that is open to several roles but narrows what each one can
 * reach inside the service — a member sees their own record, a trainer their
 * assigned members, an administrator everything.
 *
 * Purely documentary: it enforces nothing. Its job is to let the permission
 * audit distinguish "deliberately open, scoped in the service" from
 * "nobody has looked at this", which otherwise look identical from outside.
 */
export const ScopedAccess = (description: string) => SetMetadata(SCOPED_ACCESS_KEY, description);
