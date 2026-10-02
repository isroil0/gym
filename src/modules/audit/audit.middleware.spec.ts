import { AuditMiddleware } from './audit.middleware';

describe('AuditMiddleware.redact', () => {
  it('replaces every credential key, whatever its casing', () => {
    const redacted = AuditMiddleware.redact({
      email: 'mia@gym.test',
      password: 'StrongPass123',
      currentPassword: 'OldPass123',
      newPassword: 'NewPass123',
      refreshToken: 'abc',
      Token: 'xyz',
      AUTHORIZATION: 'Bearer abc',
      secret: 's3cr3t',
    }) as Record<string, unknown>;

    expect(redacted.email).toBe('mia@gym.test');
    for (const key of [
      'password',
      'currentPassword',
      'newPassword',
      'refreshToken',
      'Token',
      'AUTHORIZATION',
      'secret',
    ]) {
      expect(redacted[key]).toBe('[REDACTED]');
    }
  });

  it('never lets a credential survive anywhere in the output', () => {
    const serialized = JSON.stringify(
      AuditMiddleware.redact({
        outer: { inner: { password: 'StrongPass123', token: 'abc' } },
        list: [{ password: 'StrongPass123' }],
      }),
    );

    expect(serialized).not.toContain('StrongPass123');
    expect(serialized).not.toContain('abc');
  });

  it('keeps ordinary values intact', () => {
    expect(
      AuditMiddleware.redact({ amount: 49.99, method: 'CASH', active: true, nothing: null }),
    ).toEqual({ amount: 49.99, method: 'CASH', active: true, nothing: null });
  });

  it('truncates a very long string rather than storing it whole', () => {
    const redacted = AuditMiddleware.redact({ notes: 'x'.repeat(2000) }) as { notes: string };

    expect(redacted.notes.length).toBeLessThanOrEqual(501);
    expect(redacted.notes.endsWith('…')).toBe(true);
  });

  it('caps how many keys it copies, so a huge body stays a summary', () => {
    const big = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`key${index}`, index]),
    );

    expect(Object.keys(AuditMiddleware.redact(big) as object)).toHaveLength(50);
  });

  it('caps array length too', () => {
    expect(AuditMiddleware.redact(Array.from({ length: 200 }, () => 1))).toHaveLength(50);
  });

  it('stops descending at a sensible depth rather than recursing forever', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'too far' } } } } } };

    expect(JSON.stringify(AuditMiddleware.redact(deep))).toContain('[TRUNCATED]');
  });

  it('survives a self-referential object', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;

    expect(() => AuditMiddleware.redact(circular)).not.toThrow();
  });

  it.each([
    [null, null],
    [undefined, null],
  ])('maps %s to null', (input, expected) => {
    expect(AuditMiddleware.redact(input)).toBe(expected);
  });
});

describe('AuditMiddleware action derivation', () => {
  /** Exercised through the private static via the class, as the middleware does. */
  const derive = (method: string, url: string): string =>
    (
      AuditMiddleware as unknown as {
        deriveAction(request: { method: string; originalUrl: string; url: string }): string;
      }
    ).deriveAction({ method, originalUrl: url, url });

  it.each([
    ['POST', '/api/v1/members', 'members.create'],
    ['PATCH', '/api/v1/members/0b5f8a2e-1111-4000-8000-000000000001', 'members.update'],
    [
      'DELETE',
      '/api/v1/notifications/0b5f8a2e-1111-4000-8000-000000000001',
      'notifications.remove',
    ],
    [
      'POST',
      '/api/v1/memberships/0b5f8a2e-1111-4000-8000-000000000001/freeze',
      'memberships.freeze',
    ],
    ['POST', '/api/v1/attendance/check-in/qr', 'attendance.qr'],
    ['POST', '/api/v1/notifications/run-reminders', 'notifications.runReminders'],
  ])('derives %s %s as %s', (method, url, expected) => {
    expect(derive(method, url)).toBe(expected);
  });

  it('ignores a query string', () => {
    expect(derive('POST', '/api/v1/members?foo=bar')).toBe('members.create');
  });

  it('never returns an id as the verb', () => {
    const action = derive('PATCH', '/api/v1/members/0b5f8a2e-1111-4000-8000-000000000001');
    expect(action).not.toContain('0b5f8a2e');
  });
});
