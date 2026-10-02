import {
  DOOR_CODE_PERIOD_SECONDS,
  buildDoorCode,
  bucketFor,
  millisecondsUntilRotation,
  verifyDoorCode,
} from './door-code';

const SECRET = 'door-code-test-secret-at-least-32-characters';
const OTHER = 'a-completely-different-secret-of-sufficient-length';
const AT = (iso: string) => new Date(iso);

describe('door code', () => {
  const now = AT('2026-10-02T10:00:00.000Z');

  it('verifies a code it has just produced', () => {
    const code = buildDoorCode(now, SECRET);
    expect(verifyDoorCode(code, SECRET, now)).toEqual({ ok: true, bucket: bucketFor(now) });
  });

  it('carries no identity — only the moment', () => {
    // The member is identified by their own session, never by the code, so
    // the same code is shown to everybody standing at the door.
    const code = buildDoorCode(now, SECRET);
    const [prefix, bucket] = code.split('.');
    expect(prefix).toBe('DOOR1');
    expect(bucket).toBe(String(bucketFor(now)));
    expect(code.split('.')).toHaveLength(3);
  });

  it('shows the same code to everyone within one period', () => {
    const a = buildDoorCode(AT('2026-10-02T10:00:01.000Z'), SECRET);
    const b = buildDoorCode(AT('2026-10-02T10:00:29.000Z'), SECRET);
    expect(a).toBe(b);
  });

  it('changes once the period rolls over', () => {
    const before = buildDoorCode(AT('2026-10-02T10:00:29.000Z'), SECRET);
    const after = buildDoorCode(AT('2026-10-02T10:00:31.000Z'), SECRET);
    expect(after).not.toBe(before);
  });

  describe('a photographed code goes stale', () => {
    it('still works for the period after it was issued, covering the tick-over', () => {
      // Somebody who scans a moment after the screen refreshes must not be
      // punished for the gym's timing.
      const code = buildDoorCode(now, SECRET);
      const oneLater = new Date(now.getTime() + DOOR_CODE_PERIOD_SECONDS * 1000);
      expect(verifyDoorCode(code, SECRET, oneLater).ok).toBe(true);
    });

    it('is refused two periods later', () => {
      const code = buildDoorCode(now, SECRET);
      const twoLater = new Date(now.getTime() + DOOR_CODE_PERIOD_SECONDS * 2 * 1000);
      expect(verifyDoorCode(code, SECRET, twoLater)).toEqual({ ok: false, reason: 'EXPIRED' });
    });

    it('is refused an hour later, which is the point of the whole design', () => {
      const code = buildDoorCode(now, SECRET);
      const anHour = new Date(now.getTime() + 3_600_000);
      expect(verifyDoorCode(code, SECRET, anHour)).toEqual({ ok: false, reason: 'EXPIRED' });
    });
  });

  it('refuses a code minted for the future', () => {
    // A member cannot put their own clock forward and admit themselves early.
    const ahead = new Date(now.getTime() + DOOR_CODE_PERIOD_SECONDS * 5 * 1000);
    const code = buildDoorCode(ahead, SECRET);
    expect(verifyDoorCode(code, SECRET, now)).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('refuses a code signed with another secret', () => {
    const forged = buildDoorCode(now, OTHER);
    expect(verifyDoorCode(forged, SECRET, now)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('refuses a tampered bucket, even one inside the valid window', () => {
    const code = buildDoorCode(now, SECRET);
    const [prefix, bucket, signature] = code.split('.');
    const tampered = [prefix, String(Number(bucket) - 1), signature].join('.');
    expect(verifyDoorCode(tampered, SECRET, now)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('checks the signature before freshness, so stale and forged look alike', () => {
    // Otherwise an attacker learns which bucket numbers were ever real.
    const stale = buildDoorCode(AT('2020-01-01T00:00:00.000Z'), OTHER);
    expect(verifyDoorCode(stale, SECRET, now).ok).toBe(false);
    expect(verifyDoorCode(stale, SECRET, now)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it.each([
    ['', 'MALFORMED'],
    ['nonsense', 'MALFORMED'],
    ['DOOR1.123', 'MALFORMED'],
    ['DOOR1.123.sig.extra', 'MALFORMED'],
    ['DOOR1.notanumber.0123456789abcdef0123456789abcdef', 'MALFORMED'],
    ['DOOR1.0.0123456789abcdef0123456789abcdef', 'MALFORMED'],
  ])('rejects %p as %s', (code, reason) => {
    expect(verifyDoorCode(code, SECRET, now)).toEqual({ ok: false, reason });
  });

  it('rejects a membership card presented as a door code', () => {
    const card = 'GYM1.11111111-1111-4111-8111-111111111111.1.0123456789abcdef0123456789abcdef';
    expect(verifyDoorCode(card, SECRET, now)).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('tolerates surrounding whitespace from a scanner', () => {
    const code = buildDoorCode(now, SECRET);
    expect(verifyDoorCode(`  ${code}\n`, SECRET, now).ok).toBe(true);
  });

  describe('rotation countdown', () => {
    it('reports the time left in the current period', () => {
      expect(millisecondsUntilRotation(AT('2026-10-02T10:00:00.000Z'))).toBe(30_000);
      expect(millisecondsUntilRotation(AT('2026-10-02T10:00:10.000Z'))).toBe(20_000);
      expect(millisecondsUntilRotation(AT('2026-10-02T10:00:29.500Z'))).toBe(500);
    });

    it('never reports zero, so a countdown cannot stall', () => {
      for (let second = 0; second < 60; second += 1) {
        const at = new Date(Date.UTC(2026, 9, 2, 10, 0, second));
        expect(millisecondsUntilRotation(at)).toBeGreaterThan(0);
      }
    });
  });
});
