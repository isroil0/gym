import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { ForbiddenError } from '../../common/errors/app.exception';
import { format, money, sum } from '../../common/money/money';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import { aggregateSettlements, settleCharge } from './billing-math';
import { memberCode } from '../../common/profiles/profile-code';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type {
  MemberBillingDto,
  MembershipBalanceDto,
  QueryOutstandingDto,
} from './dto/billing.dto';

/** Everything needed to settle one member's position, in a single query. */
const BILLING_INCLUDE = {
  user: true,
  memberships: {
    include: { plan: true, payments: { include: { refunds: true } } },
    orderBy: { startDate: 'desc' },
  },
  payments: { where: { membershipId: null }, include: { refunds: true } },
} satisfies Prisma.MemberInclude;

type MemberForBilling = Prisma.MemberGetPayload<{ include: typeof BILLING_INCLUDE }>;

/**
 * Answers "what does this member still owe?".
 *
 * Nothing here is stored: a balance is always derived from the memberships and
 * the payments against them, so it cannot drift out of step with the money
 * records the way a cached total would.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
  ) {}

  async forMember(memberId: string, principal: AuthenticatedUser): Promise<MemberBillingDto> {
    // Reuse the member visibility rule rather than inventing a second one.
    if (principal.role !== UserRole.ADMIN) {
      const visible = await this.prisma.member.findFirst({
        where: { AND: [{ id: memberId }, await this.members.scopeFor(principal)] },
        select: { id: true },
      });

      // A member reads their own position through /billing/me.
      if (!visible) throw new ForbiddenError("You may not view this member's billing");
    }

    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: BILLING_INCLUDE,
    });

    if (!member) {
      // Mirrors the members module: out of reach reads as absent.
      throw new ForbiddenError("You may not view this member's billing");
    }

    return BillingService.settle(member);
  }

  async forUser(userId: string): Promise<MemberBillingDto> {
    const profile = await this.members.findByUserIdOrFail(userId);

    const member = await this.prisma.member.findUniqueOrThrow({
      where: { id: profile.id },
      include: BILLING_INCLUDE,
    });

    return BillingService.settle(member);
  }

  /**
   * Members who still owe money.
   *
   * Balances are derived, so they cannot be filtered or sorted in SQL. The
   * candidate set is narrowed to members who have at least one membership
   * before settling in memory — at ~1,000 members that is comfortably fast,
   * and it keeps one definition of a balance rather than two.
   */
  async outstanding(query: QueryOutstandingDto): Promise<PaginatedResult<MemberBillingDto>> {
    const minimum = money(query.minimumBalance ?? 0.01);

    const candidates = await this.prisma.member.findMany({
      where: { memberships: { some: {} } },
      include: BILLING_INCLUDE,
    });

    const debtors = candidates
      .map((member) => BillingService.settle(member))
      .filter((billing) => money(billing.outstanding).greaterThanOrEqualTo(minimum))
      .sort((a, b) => money(b.outstanding).comparedTo(money(a.outstanding)));

    const page = debtors.slice(query.skip, query.skip + query.take);

    return paginate(page, debtors.length, query.page, query.limit);
  }

  /** Pure: turns a loaded member into their settled billing position. */
  private static settle(member: MemberForBilling): MemberBillingDto {
    const memberships: MembershipBalanceDto[] = member.memberships.map((membership) => {
      const settlement = settleCharge({
        purchasePrice: membership.purchasePrice,
        discountAmount: membership.discountAmount,
        payments: membership.payments.map((payment) => payment.amount),
        refunds: membership.payments.flatMap((payment) =>
          payment.refunds.map((refund) => refund.amount),
        ),
      });

      return {
        membershipId: membership.id,
        planName: membership.plan.name,
        membershipStatus: membership.status,
        startDate: membership.startDate,
        endDate: membership.endDate,
        grossAmount: format(settlement.grossAmount),
        discountAmount: format(settlement.discountAmount),
        discountReason: membership.discountReason,
        amountDue: format(settlement.amountDue),
        amountPaid: format(settlement.amountPaid),
        amountRefunded: format(settlement.amountRefunded),
        netPaid: format(settlement.netPaid),
        balance: format(settlement.balance),
        outstanding: format(settlement.outstanding),
        credit: format(settlement.credit),
        settlementStatus: settlement.status,
      };
    });

    const totals = aggregateSettlements(
      member.memberships.map((membership) =>
        settleCharge({
          purchasePrice: membership.purchasePrice,
          discountAmount: membership.discountAmount,
          payments: membership.payments.map((payment) => payment.amount),
          refunds: membership.payments.flatMap((payment) =>
            payment.refunds.map((refund) => refund.amount),
          ),
        }),
      ),
    );

    const unallocated = sum(member.payments.map((payment) => payment.amount)).minus(
      sum(member.payments.flatMap((payment) => payment.refunds.map((refund) => refund.amount))),
    );

    return {
      memberId: member.id,
      memberCode: memberCode(member.memberNumber),
      memberName: `${member.user.firstName} ${member.user.lastName}`,
      email: member.user.email,
      amountDue: format(totals.amountDue),
      amountPaid: format(totals.amountPaid),
      amountRefunded: format(totals.amountRefunded),
      netPaid: format(totals.netPaid),
      balance: format(totals.balance),
      outstanding: format(totals.outstanding),
      credit: format(totals.credit),
      unallocatedPayments: format(unallocated),
      memberships,
    };
  }
}
