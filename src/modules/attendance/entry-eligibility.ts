import { MembershipStatus, ProfileStatus, UserStatus } from '@prisma/client';
import { visitsRemaining } from '../memberships/membership-period';

/**
 * Decides whether a member may come in.
 *
 * Pure, and separate from the service, because this is the rule the front desk
 * depends on: every way of being turned away has its own reason code and its
 * own message, so staff can tell a lapsed membership from a used-up visit pack
 * without reading the database.
 */

export enum EntryDenialReason {
  MEMBER_ARCHIVED = 'MEMBER_ARCHIVED',
  ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE',
  NO_MEMBERSHIP = 'NO_MEMBERSHIP',
  MEMBERSHIP_NOT_STARTED = 'MEMBERSHIP_NOT_STARTED',
  MEMBERSHIP_FROZEN = 'MEMBERSHIP_FROZEN',
  MEMBERSHIP_EXPIRED = 'MEMBERSHIP_EXPIRED',
  MEMBERSHIP_CANCELLED = 'MEMBERSHIP_CANCELLED',
  NO_VISITS_LEFT = 'NO_VISITS_LEFT',
  ALREADY_INSIDE = 'ALREADY_INSIDE',
  CARD_REVOKED = 'CARD_REVOKED',
  CARD_SUPERSEDED = 'CARD_SUPERSEDED',
  CARD_INVALID = 'CARD_INVALID',
  CARD_NOT_ISSUED = 'CARD_NOT_ISSUED',
}

export const ENTRY_DENIAL_MESSAGES: Record<EntryDenialReason, string> = {
  [EntryDenialReason.MEMBER_ARCHIVED]: 'This member is archived and cannot be admitted',
  [EntryDenialReason.ACCOUNT_INACTIVE]: "This member's account is inactive",
  [EntryDenialReason.NO_MEMBERSHIP]: 'This member has no membership',
  [EntryDenialReason.MEMBERSHIP_NOT_STARTED]:
    'This membership has not started yet and cannot be used',
  [EntryDenialReason.MEMBERSHIP_FROZEN]: 'This membership is frozen and cannot be used',
  [EntryDenialReason.MEMBERSHIP_EXPIRED]: 'This membership has expired',
  [EntryDenialReason.MEMBERSHIP_CANCELLED]: 'This membership has been cancelled',
  [EntryDenialReason.NO_VISITS_LEFT]: 'No visits remain on this membership',
  [EntryDenialReason.ALREADY_INSIDE]: 'This member is already checked in',
  [EntryDenialReason.CARD_REVOKED]: 'This membership card has been revoked',
  [EntryDenialReason.CARD_SUPERSEDED]: 'This membership card has been replaced by a newer one',
  [EntryDenialReason.CARD_INVALID]: 'This QR code is not a valid membership card',
  [EntryDenialReason.CARD_NOT_ISSUED]: 'This member has no membership card',
};

/** The subset of a membership entry needs to reason about. */
export interface MembershipForEntry {
  id: string;
  status: MembershipStatus;
  visitLimit: number | null;
  visitsUsed: number;
}

export interface EntryContext {
  memberStatus: ProfileStatus;
  accountStatus: UserStatus;
  /** The member's most relevant membership, or null when they hold none. */
  membership: MembershipForEntry | null;
  /** True when an open visit already exists for this member. */
  alreadyInside: boolean;
}

export type EntryDecision =
  | {
      allowed: true;
      membershipId: string;
      /** True when this visit consumes one of a limited allowance. */
      deductsVisit: boolean;
      /** Visits left *after* this one, or null for unlimited. */
      visitsRemainingAfter: number | null;
    }
  | { allowed: false; reason: EntryDenialReason };

/**
 * The checks run in the order the front desk would want them reported: who the
 * member is, then what they hold, then whether they are already in.
 */
export function decideEntry(context: EntryContext): EntryDecision {
  if (context.memberStatus !== ProfileStatus.ACTIVE) {
    return { allowed: false, reason: EntryDenialReason.MEMBER_ARCHIVED };
  }

  if (context.accountStatus !== UserStatus.ACTIVE) {
    return { allowed: false, reason: EntryDenialReason.ACCOUNT_INACTIVE };
  }

  const membership = context.membership;
  if (!membership) {
    return { allowed: false, reason: EntryDenialReason.NO_MEMBERSHIP };
  }

  if (membership.status !== MembershipStatus.ACTIVE) {
    return { allowed: false, reason: denialForStatus(membership.status) };
  }

  const remaining = visitsRemaining(membership.visitLimit, membership.visitsUsed);
  if (remaining !== null && remaining <= 0) {
    return { allowed: false, reason: EntryDenialReason.NO_VISITS_LEFT };
  }

  // Checked last: being already inside is not a membership problem, and
  // reporting it before the membership checks would mask a lapsed membership.
  if (context.alreadyInside) {
    return { allowed: false, reason: EntryDenialReason.ALREADY_INSIDE };
  }

  return {
    allowed: true,
    membershipId: membership.id,
    deductsVisit: membership.visitLimit !== null,
    visitsRemainingAfter: remaining === null ? null : remaining - 1,
  };
}

function denialForStatus(status: MembershipStatus): EntryDenialReason {
  switch (status) {
    case MembershipStatus.PENDING:
      return EntryDenialReason.MEMBERSHIP_NOT_STARTED;
    case MembershipStatus.FROZEN:
      return EntryDenialReason.MEMBERSHIP_FROZEN;
    case MembershipStatus.CANCELLED:
      return EntryDenialReason.MEMBERSHIP_CANCELLED;
    default:
      return EntryDenialReason.MEMBERSHIP_EXPIRED;
  }
}
