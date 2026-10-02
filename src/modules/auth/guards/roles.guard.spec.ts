import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from '../types/authenticated-user';

function contextWith(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function principal(role: UserRole): AuthenticatedUser {
  return { id: 'user-1', email: 'a@gym.test', role, status: UserStatus.ACTIVE };
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function requireRoles(roles: UserRole[] | undefined) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  }

  it('allows any authenticated role when no roles are declared', () => {
    requireRoles(undefined);
    expect(guard.canActivate(contextWith(principal(UserRole.MEMBER)))).toBe(true);
  });

  it('allows any authenticated role when the declared list is empty', () => {
    requireRoles([]);
    expect(guard.canActivate(contextWith(principal(UserRole.MEMBER)))).toBe(true);
  });

  it('allows a user holding a required role', () => {
    requireRoles([UserRole.ADMIN]);
    expect(guard.canActivate(contextWith(principal(UserRole.ADMIN)))).toBe(true);
  });

  it('allows a user holding any one of several required roles', () => {
    requireRoles([UserRole.ADMIN, UserRole.TRAINER]);
    expect(guard.canActivate(contextWith(principal(UserRole.TRAINER)))).toBe(true);
  });

  it('rejects a user without a required role', () => {
    requireRoles([UserRole.ADMIN]);
    expect(() => guard.canActivate(contextWith(principal(UserRole.MEMBER)))).toThrow(
      /requires one of the following roles: ADMIN/,
    );
  });

  it('rejects an anonymous request on a role-restricted route', () => {
    requireRoles([UserRole.ADMIN]);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(/Authentication required/);
  });
});
