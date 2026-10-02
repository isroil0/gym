import {
  DOOR_PREFIX,
  INITIAL_DOOR_CODE_VERSION,
  buildDoorCode,
  signVersion,
  verifyDoorCode,
} from './door-code';

const SECRET = 'door-code-test-secret';
const OTHER_SECRET = 'a-different-gyms-secret';
const V1 = INITIAL_DOOR_CODE_VERSION;

describe('door code', () => {
  describe('buildDoorCode', () => {
    it('encodes prefix, version and signature', () => {
      const [prefix, version, signature] = buildDoorCode(V1, SECRET).split('.');

      expect(prefix).toBe(DOOR_PREFIX);
      expect(version).toBe(String(V1));
      expect(signature).toHaveLength(32);
    });

    it('never changes, which is the entire point of a printed sign', () => {
      expect(buildDoorCode(V1, SECRET)).toBe(buildDoorCode(V1, SECRET));
    });

    it('carries no member identity — only the version is encoded', () => {
      const code = buildDoorCode(7, SECRET);

      expect(code).toBe(`${DOOR_PREFIX}.7.${signVersion(7, SECRET)}`);
    });

    it('differs between versions, so reissuing produces a genuinely new code', () => {
      expect(buildDoorCode(V1, SECRET)).not.toBe(buildDoorCode(V1 + 1, SECRET));
    });

    it('differs between gyms, so one gym’s sign cannot open another’s door', () => {
      expect(buildDoorCode(V1, SECRET)).not.toBe(buildDoorCode(V1, OTHER_SECRET));
    });
  });

  describe('verifyDoorCode', () => {
    it('accepts the current code', () => {
      const result = verifyDoorCode(buildDoorCode(V1, SECRET), SECRET, V1);

      expect(result).toEqual({ ok: true, version: V1 });
    });

    it('still accepts a code a year later — nothing here depends on the clock', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T09:00:00.000Z'));
      const code = buildDoorCode(V1, SECRET);

      jest.setSystemTime(new Date('2027-01-01T09:00:00.000Z'));

      try {
        expect(verifyDoorCode(code, SECRET, V1).ok).toBe(true);
        expect(buildDoorCode(V1, SECRET)).toBe(code);
      } finally {
        jest.useRealTimers();
      }
    });

    it('accepts surrounding whitespace from a scanner', () => {
      expect(verifyDoorCode(`  ${buildDoorCode(V1, SECRET)}\n`, SECRET, V1).ok).toBe(true);
    });

    it('accepts a reissued code at its new version', () => {
      expect(verifyDoorCode(buildDoorCode(9, SECRET), SECRET, 9).ok).toBe(true);
    });

    it('refuses a retired code after staff reissue', () => {
      const old = buildDoorCode(V1, SECRET);

      expect(verifyDoorCode(old, SECRET, V1 + 1)).toEqual({ ok: false, reason: 'RETIRED' });
    });

    it('refuses a version higher than the one in use', () => {
      // A member's own QR generator does not get to decide what is on the wall.
      expect(verifyDoorCode(buildDoorCode(V1 + 5, SECRET), SECRET, V1)).toEqual({
        ok: false,
        reason: 'RETIRED',
      });
    });

    it("refuses another gym's correctly-shaped code", () => {
      expect(verifyDoorCode(buildDoorCode(V1, OTHER_SECRET), SECRET, V1)).toEqual({
        ok: false,
        reason: 'BAD_SIGNATURE',
      });
    });

    it('refuses a tampered version with the signature left alone', () => {
      const [, , signature] = buildDoorCode(V1, SECRET).split('.');

      expect(verifyDoorCode(`${DOOR_PREFIX}.2.${signature}`, SECRET, 2)).toEqual({
        ok: false,
        reason: 'BAD_SIGNATURE',
      });
    });

    it('refuses a tampered signature', () => {
      const [prefix, version] = buildDoorCode(V1, SECRET).split('.');

      expect(verifyDoorCode(`${prefix}.${version}.${'0'.repeat(32)}`, SECRET, V1)).toEqual({
        ok: false,
        reason: 'BAD_SIGNATURE',
      });
    });

    it('refuses a membership card scanned at the door', () => {
      // Members will try this; it must fail as a door code, not half-work.
      const result = verifyDoorCode('GYMCARD1.abc123.deadbeef', SECRET, V1);

      expect(result).toEqual({ ok: false, reason: 'WRONG_PREFIX' });
    });

    it.each([
      ['empty', ''],
      ['no separators', 'DOOR1'],
      ['too few parts', 'DOOR1.1'],
      ['too many parts', 'DOOR1.1.sig.extra'],
      ['non-numeric version', 'DOOR1.abc.sig'],
      ['negative version', 'DOOR1.-1.sig'],
      ['zero version', `DOOR1.0.${signVersion(0, SECRET)}`],
      ['unrelated qr', 'https://example.com'],
    ])('refuses a %s code', (_label, code) => {
      expect(verifyDoorCode(code, SECRET, V1).ok).toBe(false);
    });

    it('refuses a signature of the wrong length without throwing', () => {
      // timingSafeEqual throws on length mismatch; the guard must come first.
      expect(() => verifyDoorCode(`${DOOR_PREFIX}.1.short`, SECRET, V1)).not.toThrow();
      expect(verifyDoorCode(`${DOOR_PREFIX}.1.short`, SECRET, V1).ok).toBe(false);
    });

    it('reports a bad signature for a retired code whose signature is also wrong', () => {
      // Signature first: a forgery must not be distinguishable from a stale
      // sign by the reason it comes back with.
      expect(verifyDoorCode(`${DOOR_PREFIX}.1.${'f'.repeat(32)}`, SECRET, 2)).toEqual({
        ok: false,
        reason: 'BAD_SIGNATURE',
      });
    });
  });
});
