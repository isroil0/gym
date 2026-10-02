import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * QR membership card payloads.
 *
 * A card encodes `GYM1.<memberId>.<version>.<signature>`, where the signature
 * is an HMAC of the id and version under a server-side secret.
 *
 * Nothing secret is stored for a card. That buys three things at once:
 * the server can re-render a member's QR at any time (they can lose their
 * phone and simply open the app again), a database leak yields no usable
 * card, and bumping `version` instantly invalidates every copy already
 * printed or screenshotted.
 *
 * The signature is compared in constant time, so a forged card cannot be
 * refined byte-by-byte from response timings.
 */

export const CARD_PREFIX = 'GYM1';
const SEPARATOR = '.';
/** 32 hex characters = 128 bits, ample against forgery and short enough to scan. */
const SIGNATURE_LENGTH = 32;

export interface CardPayload {
  memberId: string;
  version: number;
}

export function signCardPayload(payload: CardPayload, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${payload.memberId}${SEPARATOR}${payload.version}`)
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
}

/** The exact string encoded into the QR image. */
export function buildCardToken(payload: CardPayload, secret: string): string {
  return [
    CARD_PREFIX,
    payload.memberId,
    String(payload.version),
    signCardPayload(payload, secret),
  ].join(SEPARATOR);
}

export type CardParseFailure = 'MALFORMED' | 'WRONG_PREFIX' | 'BAD_VERSION' | 'BAD_SIGNATURE';

export type CardParseResult =
  { ok: true; payload: CardPayload } | { ok: false; reason: CardParseFailure };

/**
 * Validates a scanned token's shape and signature. Says nothing about whether
 * the card is current or revoked — that needs the database.
 */
export function parseCardToken(token: string, secret: string): CardParseResult {
  const parts = token.trim().split(SEPARATOR);

  if (parts.length !== 4) return { ok: false, reason: 'MALFORMED' };

  const [prefix, memberId, rawVersion, signature] = parts;

  if (prefix !== CARD_PREFIX) return { ok: false, reason: 'WRONG_PREFIX' };
  if (memberId.length === 0) return { ok: false, reason: 'MALFORMED' };

  if (!/^\d+$/.test(rawVersion)) return { ok: false, reason: 'BAD_VERSION' };
  const version = Number.parseInt(rawVersion, 10);
  if (!Number.isSafeInteger(version) || version < 1) return { ok: false, reason: 'BAD_VERSION' };

  if (!constantTimeEquals(signature, signCardPayload({ memberId, version }, secret))) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  return { ok: true, payload: { memberId, version } };
}

/** Length-safe constant-time comparison of two hex strings. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  // timingSafeEqual throws on a length mismatch, which would itself leak.
  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}
