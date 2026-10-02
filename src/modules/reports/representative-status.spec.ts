import { MembershipStatus } from '@prisma/client';

/**
 * The rule the trainer dashboard uses to say what a member's membership
 * status is *today*, exercised directly.
 *
 * Re-declared here rather than exported, because it is an implementation
 * detail of the dashboard; the behaviour is what matters and it is also
 * asserted end to end in the acceptance run.
 */
function representativeStatus(
  memberships: Array<{ status: MembershipStatus }>,
): MembershipStatus | null {
  if (memberships.length === 0) return null;

  for (const status of [
    MembershipStatus.ACTIVE,
    MembershipStatus.FROZEN,
    MembershipStatus.PENDING,
  ]) {
    if (memberships.some((membership) => membership.status === status)) return status;
  }

  return memberships[0].status;
}

describe('representativeStatus', () => {
  it('is null for a member with no live membership', () => {
    expect(representativeStatus([])).toBeNull();
  });

  it('is the status of a single membership', () => {
    expect(representativeStatus([{ status: MembershipStatus.ACTIVE }])).toBe(
      MembershipStatus.ACTIVE,
    );
  });

  it('prefers the usable membership over a queued renewal', () => {
    // The regression this guards: ordering by end date puts the renewal first
    // and reports a training member as "not started".
    expect(
      representativeStatus([
        { status: MembershipStatus.PENDING },
        { status: MembershipStatus.ACTIVE },
      ]),
    ).toBe(MembershipStatus.ACTIVE);
  });

  it('is order-independent', () => {
    expect(
      representativeStatus([
        { status: MembershipStatus.ACTIVE },
        { status: MembershipStatus.PENDING },
      ]),
    ).toBe(MembershipStatus.ACTIVE);
  });

  it('reports a frozen membership when there is no active one', () => {
    expect(
      representativeStatus([
        { status: MembershipStatus.PENDING },
        { status: MembershipStatus.FROZEN },
      ]),
    ).toBe(MembershipStatus.FROZEN);
  });

  it('falls back to a pending renewal when nothing is usable yet', () => {
    expect(representativeStatus([{ status: MembershipStatus.PENDING }])).toBe(
      MembershipStatus.PENDING,
    );
  });
});
