import { describe, expect, it } from 'vitest';
import { canEnter, homeFor, roleOwning } from '../roles';

describe('role areas', () => {
  it('sends each role to its own area', () => {
    expect(homeFor('ADMIN')).toBe('/admin');
    expect(homeFor('TRAINER')).toBe('/trainer');
    expect(homeFor('MEMBER')).toBe('/me');
    expect(homeFor(undefined)).toBe('/login');
  });

  it('lets a role into its own area and nowhere else', () => {
    expect(canEnter('ADMIN', '/admin')).toBe(true);
    expect(canEnter('ADMIN', '/admin/members/abc')).toBe(true);
    expect(canEnter('ADMIN', '/trainer')).toBe(false);
    expect(canEnter('ADMIN', '/me/card')).toBe(false);

    expect(canEnter('TRAINER', '/trainer/sessions')).toBe(true);
    expect(canEnter('TRAINER', '/admin/accounting')).toBe(false);

    expect(canEnter('MEMBER', '/me/payments')).toBe(true);
    expect(canEnter('MEMBER', '/admin')).toBe(false);
    expect(canEnter('MEMBER', '/trainer')).toBe(false);
  });

  it('does not let a lookalike prefix through', () => {
    // "/administrator" must not satisfy the "/admin" area.
    expect(canEnter('ADMIN', '/administrator')).toBe(false);
    expect(roleOwning('/administrator')).toBeNull();
  });

  it('identifies which role owns a path', () => {
    expect(roleOwning('/admin/payments')).toBe('ADMIN');
    expect(roleOwning('/trainer')).toBe('TRAINER');
    expect(roleOwning('/me/workout')).toBe('MEMBER');
    expect(roleOwning('/login')).toBeNull();
  });
});
