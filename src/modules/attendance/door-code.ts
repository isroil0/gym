import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The code on the screen at the gym's door, which members scan to admit
 * themselves.
 *
 * This is the mirror image of a membership card: the card identifies a
 * person and is scanned by staff, whereas a door code identifies a *moment*
 * and is scanned by the member. The member's own session says who they are,
 * so the code carries no identity at all.
 *
 * It encodes `DOOR1.<bucket>.<signature>`, where `bucket` is the current
 * time divided by a rotation period and the signature is an HMAC of it.
 *
 * Rotation is the whole point. A code that never changed would be
 * photographed once and passed around, and members would check in from home —
 * which would quietly corrupt attendance, visit allowances and every report
 * built on them. A short period means a stolen photograph is worthless within
 * a minute.
 *
 * The previous bucket is also accepted, so somebody who scans a fraction of a
 * second after the screen ticks over is not rejected for the gym's timing.
 */

export const DOOR_PREFIX = 'DOOR1';
const SEPARATOR = '.';
const SIGNATURE_LENGTH = 32;

/**
 * How long one code lasts. Thirty seconds is short enough that a photograph
 * is useless by the time it has been sent to anybody, and long enough that a
 * member fumbling with their camera is not punished for it.
 */
export const DOOR_CODE_PERIOD_SECONDS = 30;

/** How many expired buckets still verify. One covers the tick-over race. */
const GRACE_BUCKETS = 1;

export function bucketFor(now: Date, periodSeconds = DOOR_CODE_PERIOD_SECONDS): number {
  return Math.floor(now.getTime() / 1000 / periodSeconds);
}

export function signBucket(bucket: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${DOOR_PREFIX}${SEPARATOR}${bucket}`)
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
}

/** The exact string rendered as a QR on the door screen. */
export function buildDoorCode(
  now: Date,
  secret: string,
  periodSeconds = DOOR_CODE_PERIOD_SECONDS,
): string {
  const bucket = bucketFor(now, periodSeconds);
  return [DOOR_PREFIX, String(bucket), signBucket(bucket, secret)].join(SEPARATOR);
}

/** Milliseconds until the code on screen stops being the current one. */
export function millisecondsUntilRotation(
  now: Date,
  periodSeconds = DOOR_CODE_PERIOD_SECONDS,
): number {
  const period = periodSeconds * 1000;
  return period - (now.getTime() % period);
}

export type DoorCodeFailure = 'MALFORMED' | 'WRONG_PREFIX' | 'BAD_SIGNATURE' | 'EXPIRED';

export type DoorCodeResult = { ok: true; bucket: number } | { ok: false; reason: DoorCodeFailure };

/**
 * Validates a scanned door code.
 *
 * The signature is checked against the current bucket and the one before it,
 * both in constant time, so neither a forgery nor a stale code can be refined
 * from response timings. A code from a future bucket is rejected outright: a
 * member's clock has no say in whether they are standing at the door.
 */
export function verifyDoorCode(
  code: string,
  secret: string,
  now: Date,
  periodSeconds = DOOR_CODE_PERIOD_SECONDS,
): DoorCodeResult {
  const parts = code.trim().split(SEPARATOR);

  if (parts.length !== 3) return { ok: false, reason: 'MALFORMED' };

  const [prefix, rawBucket, signature] = parts;

  if (prefix !== DOOR_PREFIX) return { ok: false, reason: 'WRONG_PREFIX' };
  if (!/^\d+$/.test(rawBucket)) return { ok: false, reason: 'MALFORMED' };

  const bucket = Number.parseInt(rawBucket, 10);
  if (!Number.isSafeInteger(bucket) || bucket < 1) return { ok: false, reason: 'MALFORMED' };

  // Verify the signature before deciding anything about freshness, so a
  // forged code and a stale one are indistinguishable from the outside.
  if (!constantTimeEquals(signature, signBucket(bucket, secret))) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  const current = bucketFor(now, periodSeconds);
  if (bucket > current) return { ok: false, reason: 'EXPIRED' };
  if (current - bucket > GRACE_BUCKETS) return { ok: false, reason: 'EXPIRED' };

  return { ok: true, bucket };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
