import { MembershipStatus, ProfileStatus, UserStatus } from '@prisma/client';
import {
  ENTRY_DENIAL_MESSAGES,
  EntryDenialReason,
  decideEntry,
  type EntryContext,
  type MembershipForEntry,
} from './entry-eligibility';

function membership(overrides: Partial<MembershipForEntry> = {}): MembershipForEntry {
  return {
    id: 'mm-1',
    status: MembershipStatus.ACTIVE,
    visitLimit: null,
    visitsUsed: 0,
    ...overrides,
  };
}

function context(overrides: Partial<EntryContext> = {}): EntryContext {
  return {
    memberStatus: ProfileStatus.ACTIVE,
    accountStatus: UserStatus.ACTIVE,
    membership: membership(),
    alreadyInside: false,
    ...overrides,
  };
}

describe('decideEntry — admitted', () => {
  it('lets in an active member on an unlimited membership', () => {
    const decision = decideEntry(context());

    expect(decision).toEqual({
      allowed: true,
      membershipId: 'mm-1',
      deductsVisit: false,
      visitsRemainingAfter: null,
    });
  });

  it('deducts a visit on a limited membership and reports what is left', () => {
    const decision = decideEntry(
      context({ membership: membership({ visitLimit: 10, visitsUsed: 3 }) }),
    );

    expect(decision).toEqual({
      allowed: true,
      membershipId: 'mm-1',
      deductsVisit: true,
      visitsRemainingAfter: 6,
    });
  });

  it('admits the very last visit of a pack', () => {
    const decision = decideEntry(
      context({ membership: membership({ visitLimit: 10, visitsUsed: 9 }) }),
    );

    expect(decision).toEqual(expect.objectContaining({ allowed: true, visitsRemainingAfter: 0 }));
  });
});

describe('decideEntry — turned away', () => {
  it('refuses an archived member', () => {
    expect(decideEntry(context({ memberStatus: ProfileStatus.ARCHIVED }))).toEqual({
      allowed: false,
      reason: EntryDenialReason.MEMBER_ARCHIVED,
    });
  });

  it('refuses a deactivated account', () => {
    expect(decideEntry(context({ accountStatus: UserStatus.INACTIVE }))).toEqual({
      allowed: false,
      reason: EntryDenialReason.ACCOUNT_INACTIVE,
    });
  });

  it('refuses a member with no membership', () => {
    expect(decideEntry(context({ membership: null }))).toEqual({
      allowed: false,
      reason: EntryDenialReason.NO_MEMBERSHIP,
    });
  });

  it.each([
    [MembershipStatus.PENDING, EntryDenialReason.MEMBERSHIP_NOT_STARTED],
    [MembershipStatus.FROZEN, EntryDenialReason.MEMBERSHIP_FROZEN],
    [MembershipStatus.EXPIRED, EntryDenialReason.MEMBERSHIP_EXPIRED],
    [MembershipStatus.CANCELLED, EntryDenialReason.MEMBERSHIP_CANCELLED],
  ])('refuses a %s membership with its own reason', (status, reason) => {
    expect(decideEntry(context({ membership: membership({ status }) }))).toEqual({
      allowed: false,
      reason,
    });
  });

  it('refuses a used-up visit pack', () => {
    expect(
      decideEntry(context({ membership: membership({ visitLimit: 10, visitsUsed: 10 }) })),
    ).toEqual({ allowed: false, reason: EntryDenialReason.NO_VISITS_LEFT });
  });

  it('refuses an over-used pack without going negative', () => {
    expect(
      decideEntry(context({ membership: membership({ visitLimit: 10, visitsUsed: 12 }) })),
    ).toEqual({ allowed: false, reason: EntryDenialReason.NO_VISITS_LEFT });
  });

  it('refuses a member already inside', () => {
    expect(decideEntry(context({ alreadyInside: true }))).toEqual({
      allowed: false,
      reason: EntryDenialReason.ALREADY_INSIDE,
    });
  });
});

describe('decideEntry — order of checks', () => {
  it('reports a lapsed membership rather than "already inside"', () => {
    // Otherwise a member who never checked out would be told to check out,
    // hiding the fact that their membership ran out days ago.
    const decision = decideEntry(
      context({
        membership: membership({ status: MembershipStatus.EXPIRED }),
        alreadyInside: true,
      }),
    );

    expect(decision).toEqual({
      allowed: false,
      reason: EntryDenialReason.MEMBERSHIP_EXPIRED,
    });
  });

  it('reports an archived member before anything about their membership', () => {
    const decision = decideEntry(
      context({ memberStatus: ProfileStatus.ARCHIVED, membership: null }),
    );

    expect(decision).toEqual({
      allowed: false,
      reason: EntryDenialReason.MEMBER_ARCHIVED,
    });
  });

  it('reports an exhausted pack before "already inside"', () => {
    const decision = decideEntry(
      context({ membership: membership({ visitLimit: 1, visitsUsed: 1 }), alreadyInside: true }),
    );

    expect(decision).toEqual({
      allowed: false,
      reason: EntryDenialReason.NO_VISITS_LEFT,
    });
  });
});

describe('ENTRY_DENIAL_MESSAGES', () => {
  it('has a distinct, non-empty message for every reason', () => {
    const reasons = Object.values(EntryDenialReason);
    const messages = reasons.map((reason) => ENTRY_DENIAL_MESSAGES[reason]);

    expect(messages.every((message) => message.length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(reasons.length);
  });
});
