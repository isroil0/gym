import {
  CARD_PREFIX,
  buildCardToken,
  parseCardToken,
  signCardPayload,
} from './membership-card-token';

const SECRET = 'a-test-qr-secret-that-is-long-enough-32';
const OTHER_SECRET = 'a-completely-different-qr-secret-value!!';
const MEMBER = '0b5f8a2e-1111-4000-8000-000000000001';

describe('buildCardToken', () => {
  it('produces a four-part token with the expected prefix', () => {
    const token = buildCardToken({ memberId: MEMBER, version: 1 }, SECRET);
    const parts = token.split('.');

    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe(CARD_PREFIX);
    expect(parts[1]).toBe(MEMBER);
    expect(parts[2]).toBe('1');
    expect(parts[3]).toHaveLength(32);
  });

  it('is deterministic, so a member can re-open their card any time', () => {
    const a = buildCardToken({ memberId: MEMBER, version: 3 }, SECRET);
    const b = buildCardToken({ memberId: MEMBER, version: 3 }, SECRET);

    expect(a).toBe(b);
  });

  it('never embeds the secret', () => {
    const token = buildCardToken({ memberId: MEMBER, version: 1 }, SECRET);
    expect(token).not.toContain(SECRET);
  });

  it('changes completely when the version is bumped', () => {
    const v1 = buildCardToken({ memberId: MEMBER, version: 1 }, SECRET);
    const v2 = buildCardToken({ memberId: MEMBER, version: 2 }, SECRET);

    expect(v1).not.toBe(v2);
    expect(v1.split('.')[3]).not.toBe(v2.split('.')[3]);
  });

  it('differs between members', () => {
    const other = '0b5f8a2e-2222-4000-8000-000000000002';

    expect(signCardPayload({ memberId: MEMBER, version: 1 }, SECRET)).not.toBe(
      signCardPayload({ memberId: other, version: 1 }, SECRET),
    );
  });

  it('differs between secrets, so rotating the secret invalidates every card', () => {
    expect(buildCardToken({ memberId: MEMBER, version: 1 }, SECRET)).not.toBe(
      buildCardToken({ memberId: MEMBER, version: 1 }, OTHER_SECRET),
    );
  });
});

describe('parseCardToken', () => {
  const valid = buildCardToken({ memberId: MEMBER, version: 2 }, SECRET);

  it('round-trips a token it issued', () => {
    const result = parseCardToken(valid, SECRET);

    expect(result).toEqual({ ok: true, payload: { memberId: MEMBER, version: 2 } });
  });

  it('tolerates surrounding whitespace from a scanner', () => {
    expect(parseCardToken(`  ${valid}\n`, SECRET).ok).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['too few parts', 'GYM1.abc.1'],
    ['too many parts', `${valid}.extra`],
    ['an empty member id', `GYM1..1.${'0'.repeat(32)}`],
  ])('rejects %s as malformed', (_label, token) => {
    expect(parseCardToken(token, SECRET)).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it("rejects an unknown prefix, so another system's QR cannot be scanned in", () => {
    expect(parseCardToken(valid.replace('GYM1', 'OTHER'), SECRET)).toEqual({
      ok: false,
      reason: 'WRONG_PREFIX',
    });
  });

  it.each([
    ['a non-numeric version', `GYM1.${MEMBER}.abc.${'0'.repeat(32)}`],
    ['a zero version', `GYM1.${MEMBER}.0.${'0'.repeat(32)}`],
    ['a negative version', `GYM1.${MEMBER}.-1.${'0'.repeat(32)}`],
  ])('rejects %s', (_label, token) => {
    expect(parseCardToken(token, SECRET)).toEqual({ ok: false, reason: 'BAD_VERSION' });
  });

  it('rejects a tampered signature', () => {
    const tampered = `${valid.slice(0, -4)}dead`;
    expect(parseCardToken(tampered, SECRET)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(parseCardToken(`GYM1.${MEMBER}.2.abc`, SECRET)).toEqual({
      ok: false,
      reason: 'BAD_SIGNATURE',
    });
  });

  it('rejects a token signed with a different secret', () => {
    const foreign = buildCardToken({ memberId: MEMBER, version: 2 }, OTHER_SECRET);
    expect(parseCardToken(foreign, SECRET)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it("rejects a member id swapped into someone else's signed token", () => {
    const victim = '0b5f8a2e-3333-4000-8000-000000000003';
    const parts = valid.split('.');
    const forged = ['GYM1', victim, parts[2], parts[3]].join('.');

    expect(parseCardToken(forged, SECRET)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('still parses an older version, which the database then rejects as stale', () => {
    // Shape and signature are valid; currency is a database question, not a
    // cryptographic one.
    const old = buildCardToken({ memberId: MEMBER, version: 1 }, SECRET);

    expect(parseCardToken(old, SECRET)).toEqual({
      ok: true,
      payload: { memberId: MEMBER, version: 1 },
    });
  });
});
