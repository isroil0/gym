import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The code on the sign at the gym's door, which members scan to admit
 * themselves.
 *
 * This is the mirror image of a membership card: the card identifies a
 * person and is scanned by staff, whereas a door code identifies the *door*
 * and is scanned by the member. The member's own session says who they are,
 * so the code carries no identity whatsoever — printing it on a wall where
 * the whole street can read it leaks nothing about anybody.
 *
 * It encodes `DOOR1.<version>.<signature>`, where the signature is an HMAC
 * over the version. The code is fixed: the same string today and next year,
 * so it can be printed once and stuck by the turnstile.
 *
 * The signature is what makes it the *gym's* code rather than any QR a
 * member happens to generate. The version is the way back if a code is
 * abused: staff bump it, every copy in circulation stops verifying, and a
 * new sign goes up. Without it the only remedy would be rotating the signing
 * secret, which would also invalidate every membership card in the building.
 */

export const DOOR_PREFIX = 'DOOR1';
const SEPARATOR = '.';
const SIGNATURE_LENGTH = 32;

/** The version a gym starts on, before staff have ever reissued the code. */
export const INITIAL_DOOR_CODE_VERSION = 1;

export function signVersion(version: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${DOOR_PREFIX}${SEPARATOR}${version}`)
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
}

/** The exact string rendered as the QR on the door sign. */
export function buildDoorCode(version: number, secret: string): string {
  return [DOOR_PREFIX, String(version), signVersion(version, secret)].join(SEPARATOR);
}

export type DoorCodeFailure = 'MALFORMED' | 'WRONG_PREFIX' | 'BAD_SIGNATURE' | 'RETIRED';

export type DoorCodeResult = { ok: true; version: number } | { ok: false; reason: DoorCodeFailure };

/**
 * Validates a scanned door code against the version currently in use.
 *
 * The signature is checked before the version is compared, and in constant
 * time, so a forgery and a retired-but-genuine code are indistinguishable
 * from the outside. Any version other than the current one is refused —
 * including a higher one, since a member's QR generator has no say in which
 * code the gym has put on its wall.
 */
export function verifyDoorCode(
  code: string,
  secret: string,
  currentVersion: number,
): DoorCodeResult {
  const parts = code.trim().split(SEPARATOR);

  if (parts.length !== 3) return { ok: false, reason: 'MALFORMED' };

  const [prefix, rawVersion, signature] = parts;

  if (prefix !== DOOR_PREFIX) return { ok: false, reason: 'WRONG_PREFIX' };
  if (!/^\d+$/.test(rawVersion)) return { ok: false, reason: 'MALFORMED' };

  const version = Number.parseInt(rawVersion, 10);
  if (!Number.isSafeInteger(version) || version < INITIAL_DOOR_CODE_VERSION) {
    return { ok: false, reason: 'MALFORMED' };
  }

  if (!constantTimeEquals(signature, signVersion(version, secret))) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  if (version !== currentVersion) return { ok: false, reason: 'RETIRED' };

  return { ok: true, version };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
