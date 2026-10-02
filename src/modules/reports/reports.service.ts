import { Injectable } from '@nestjs/common';
import {
  AccountingEntryType,
  CheckInMethod,
  MembershipStatus,
  ProfileStatus,
  TrainingSessionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GymTimeService } from '../../common/time/gym-time.service';
import { AccountingService } from '../accounting/accounting.service';
import { BillingService } from '../payments/billing.service';
import { MembershipsService } from '../memberships/memberships.service';
import { BusinessRuleError } from '../../common/errors/app.exception';
import { ZERO, atLeastZero, format, money, sum, type Money } from '../../common/money/money';
import { memberCode, trainerCode } from '../../common/profiles/profile-code';
import { sessionDurationMinutes } from '../workouts/session-scheduling';
import { ReportGrouping, type ReportPeriodMetaDto } from './dto/common.dto';
import { bucketKey, bucketLabels } from './reporting.util';
import type {
  AttendanceReportDto,
  ExpenseReportDto,
  ExpiredMembershipsReportDto,
  MembershipSalesReportDto,
  ProfitReportDto,
  RenewalsReportDto,
  RevenueReportDto,
  TrainerStatsReportDto,
  UnpaidBalancesReportDto,
} from './dto/report.dto';

/** Hours of the local day shown in the attendance breakdown. */
const HOURS_IN_DAY = 24;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gymTime: GymTimeService,
    private readonly accounting: AccountingService,
    private readonly billing: BillingService,
    private readonly memberships: MembershipsService,
  ) {}

  // -------------------------------------------------------------------------
  // Period handling
  // -------------------------------------------------------------------------

  /**
   * Validates a period and describes it back.
   *
   * Every report states the zone its dates were read in, so a figure can always
   * be reconciled against the gym's calendar rather than the server's.
   */
  private period(from: string, to: string): ReportPeriodMetaDto {
    if (to < from) {
      throw new BusinessRuleError('`to` must not be earlier than `from`', [
        { field: 'to', messages: ['must be on or after from'] },
      ]);
    }

    return { from, to, timeZone: this.gymTime.zone };
  }

  /** Instants spanning the period, for filtering timestamp columns. */
  private instants(from: string, to: string): { start: Date; end: Date } {
    return this.gymTime.range(from, to);
  }

  /** Date-only bounds, for filtering SQL `date` columns. */
  private dates(from: string, to: string): { start: Date; end: Date } {
    return {
      start: this.gymTime.localDateAsUtcMidnight(from),
      end: this.gymTime.localDateAsUtcMidnight(to),
    };
  }

  // -------------------------------------------------------------------------
  // Membership sales
  // -------------------------------------------------------------------------

  async membershipSales(
    from: string,
    to: string,
    groupBy: ReportGrouping,
  ): Promise<MembershipSalesReportDto> {
    const period = this.period(from, to);
    const { start, end } = this.instants(from, to);

    const sold = await this.prisma.memberMembership.findMany({
      where: { createdAt: { gte: start, lt: end } },
      include: { plan: true },
      orderBy: { createdAt: 'asc' },
    });

    const byPlan = new Map<
      string,
      { planId: string; planName: string; sold: number; gross: Money; discounts: Money }
    >();
    const counts = new Map<string, number>();

    for (const membership of sold) {
      const row = byPlan.get(membership.planId) ?? {
        planId: membership.planId,
        planName: membership.plan.name,
        sold: 0,
        gross: ZERO,
        discounts: ZERO,
      };

      row.sold += 1;
      row.gross = row.gross.plus(membership.purchasePrice);
      row.discounts = row.discounts.plus(membership.discountAmount);
      byPlan.set(membership.planId, row);

      const bucket = bucketKey(membership.createdAt, groupBy, this.gymTime);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    const gross = sum(sold.map((membership) => membership.purchasePrice));
    const discounts = sum(sold.map((membership) => membership.discountAmount));
    const renewals = sold.filter((membership) => membership.previousMembershipId !== null).length;

    return {
      period,
      totalSold: sold.length,
      grossValue: format(gross),
      discounts: format(discounts),
      netValue: format(atLeastZero(gross.minus(discounts))),
      renewals,
      firstTimeSales: sold.length - renewals,
      byPlan: [...byPlan.values()]
        .sort((a, b) => b.sold - a.sold)
        .map((row) => ({
          planId: row.planId,
          planName: row.planName,
          sold: row.sold,
          grossValue: format(row.gross),
          discounts: format(row.discounts),
          netValue: format(atLeastZero(row.gross.minus(row.discounts))),
        })),
      series: bucketLabels(from, to, groupBy, this.gymTime).map((bucket) => ({
        bucket,
        value: String(counts.get(bucket) ?? 0),
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Financial reports — all delegate the arithmetic to AccountingService, so
  // revenue and profit are defined in exactly one place.
  // -------------------------------------------------------------------------

  async revenue(from: string, to: string, groupBy: ReportGrouping): Promise<RevenueReportDto> {
    const period = this.period(from, to);
    const { start, end } = this.dates(from, to);

    const [totals, byMethod, series] = await Promise.all([
      this.accounting.totalsForPeriod(start, end),
      this.accounting.byPaymentMethod(start, end),
      this.ledgerSeries(from, to, groupBy),
    ]);

    return {
      period,
      income: format(totals.income),
      refunds: format(totals.refunds),
      revenue: format(totals.revenue),
      byPaymentMethod: byMethod.map((row) => ({
        method: row.method,
        income: format(row.income),
        refunds: format(row.refunds),
      })),
      series: series.map((point) => ({ bucket: point.bucket, value: format(point.revenue) })),
    };
  }

  async expenses(from: string, to: string, groupBy: ReportGrouping): Promise<ExpenseReportDto> {
    const period = this.period(from, to);
    const { start, end } = this.dates(from, to);

    const [totals, byCategory, series] = await Promise.all([
      this.accounting.totalsForPeriod(start, end),
      this.accounting.expensesByCategory(start, end),
      this.ledgerSeries(from, to, groupBy),
    ]);

    return {
      period,
      expenses: format(totals.expenses),
      byCategory: byCategory.map((row) => ({
        expenseCategoryId: row.expenseCategoryId,
        expenseCategoryName: row.expenseCategoryName,
        amount: format(row.amount),
        share: totals.expenses.isZero()
          ? 0
          : Math.round(row.amount.dividedBy(totals.expenses).times(1000).toNumber()) / 10,
      })),
      series: series.map((point) => ({ bucket: point.bucket, value: format(point.expenses) })),
    };
  }

  async profit(from: string, to: string, groupBy: ReportGrouping): Promise<ProfitReportDto> {
    const period = this.period(from, to);
    const { start, end } = this.dates(from, to);

    const [totals, series] = await Promise.all([
      this.accounting.totalsForPeriod(start, end),
      this.ledgerSeries(from, to, groupBy),
    ]);

    return {
      period,
      revenue: format(totals.revenue),
      expenses: format(totals.expenses),
      profit: format(totals.profit),
      marginPercent: totals.revenue.isZero()
        ? null
        : Math.round(totals.profit.dividedBy(totals.revenue).times(1000).toNumber()) / 10,
      series: series.map((point) => ({
        bucket: point.bucket,
        revenue: format(point.revenue),
        expenses: format(point.expenses),
        profit: format(point.revenue.minus(point.expenses)),
      })),
    };
  }

  /**
   * One ledger pass bucketed by local day or month, shared by the three
   * financial reports so their series can never disagree.
   *
   * `occurred_on` is a `date` column, so bucketing needs no zone conversion —
   * the gym's local date was already applied when the entry was written.
   */
  private async ledgerSeries(
    from: string,
    to: string,
    groupBy: ReportGrouping,
  ): Promise<Array<{ bucket: string; revenue: Money; expenses: Money }>> {
    const { start, end } = this.dates(from, to);

    const rows = await this.prisma.accountingEntry.groupBy({
      by: ['occurredOn', 'type'],
      where: { voidedAt: null, occurredOn: { gte: start, lte: end } },
      _sum: { amount: true },
    });

    const buckets = new Map<string, { income: Money; refunds: Money; expenses: Money }>();

    for (const row of rows) {
      const localDate = row.occurredOn.toISOString().slice(0, 10);
      const bucket = groupBy === ReportGrouping.MONTH ? localDate.slice(0, 7) : localDate;
      const current = buckets.get(bucket) ?? { income: ZERO, refunds: ZERO, expenses: ZERO };
      const amount = money(row._sum.amount ?? 0);

      if (row.type === AccountingEntryType.INCOME) current.income = current.income.plus(amount);
      else if (row.type === AccountingEntryType.REFUND)
        current.refunds = current.refunds.plus(amount);
      else current.expenses = current.expenses.plus(amount);

      buckets.set(bucket, current);
    }

    return bucketLabels(from, to, groupBy, this.gymTime).map((bucket) => {
      const totals = buckets.get(bucket) ?? { income: ZERO, refunds: ZERO, expenses: ZERO };
      return {
        bucket,
        revenue: totals.income.minus(totals.refunds),
        expenses: totals.expenses,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Attendance
  // -------------------------------------------------------------------------

  async attendance(
    from: string,
    to: string,
    groupBy: ReportGrouping,
  ): Promise<AttendanceReportDto> {
    const period = this.period(from, to);
    const { start, end } = this.instants(from, to);

    const visits = await this.prisma.attendance.findMany({
      where: { checkedInAt: { gte: start, lt: end } },
      select: {
        memberId: true,
        checkedInAt: true,
        checkedOutAt: true,
        method: true,
      },
    });

    const buckets = new Map<string, { visits: number; members: Set<string> }>();
    const byMethod: Record<CheckInMethod, number> = { MANUAL: 0, QR: 0 };
    const hourCounts = new Array<number>(HOURS_IN_DAY).fill(0);
    const uniqueMembers = new Set<string>();
    const durations: number[] = [];

    for (const visit of visits) {
      const bucket = bucketKey(visit.checkedInAt, groupBy, this.gymTime);
      const current = buckets.get(bucket) ?? { visits: 0, members: new Set<string>() };
      current.visits += 1;
      current.members.add(visit.memberId);
      buckets.set(bucket, current);

      byMethod[visit.method] += 1;
      uniqueMembers.add(visit.memberId);

      // The busiest hour is a local-clock question: 18:00 means six in the
      // evening at the gym, whatever that is in UTC.
      const localHour = Number.parseInt(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: this.gymTime.zone,
          hour: '2-digit',
          hour12: false,
        }).format(visit.checkedInAt),
        10,
      );
      if (Number.isInteger(localHour) && localHour >= 0 && localHour < HOURS_IN_DAY) {
        hourCounts[localHour] += 1;
      }

      if (visit.checkedOutAt) {
        durations.push(sessionDurationMinutes(visit.checkedInAt, visit.checkedOutAt));
      }
    }

    const labels = bucketLabels(from, to, groupBy, this.gymTime);
    const dayCount = Math.max(1, bucketLabels(from, to, ReportGrouping.DAY, this.gymTime).length);

    return {
      period,
      totalVisits: visits.length,
      uniqueMembers: uniqueMembers.size,
      averageVisitsPerDay: Math.round((visits.length / dayCount) * 10) / 10,
      averageDurationMinutes:
        durations.length === 0
          ? null
          : Math.round(durations.reduce((total, value) => total + value, 0) / durations.length),
      byMethod,
      busiestHours: hourCounts
        .map((count, hour) => ({ hour, visits: count }))
        .filter((row) => row.visits > 0)
        .sort((a, b) => b.visits - a.visits || a.hour - b.hour)
        .slice(0, 5),
      series: labels.map((bucket) => {
        const current = buckets.get(bucket);
        return {
          bucket,
          visits: current?.visits ?? 0,
          uniqueMembers: current?.members.size ?? 0,
        };
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Renewals
  // -------------------------------------------------------------------------

  async renewals(from: string, to: string): Promise<RenewalsReportDto> {
    const period = this.period(from, to);
    const { start, end } = this.instants(from, to);
    const dateBounds = this.dates(from, to);

    const [renewed, endedInPeriod] = await Promise.all([
      this.prisma.memberMembership.findMany({
        where: { previousMembershipId: { not: null }, createdAt: { gte: start, lt: end } },
        include: {
          plan: true,
          member: { include: { user: true } },
          previousMembership: { include: { plan: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.memberMembership.findMany({
        where: {
          endDate: { gte: dateBounds.start, lte: dateBounds.end },
          status: { in: [MembershipStatus.EXPIRED, MembershipStatus.CANCELLED] },
        },
        select: { id: true, renewedBy: { select: { id: true } } },
      }),
    ]);

    const lapsedWithoutRenewal = endedInPeriod.filter(
      (membership) => membership.renewedBy === null,
    ).length;

    const rows = renewed
      .filter((membership) => membership.previousMembership !== null)
      .map((membership) => {
        const previous = membership.previousMembership!;
        return {
          membershipId: membership.id,
          previousMembershipId: previous.id,
          memberId: membership.memberId,
          memberCode: memberCode(membership.member.memberNumber),
          memberName: `${membership.member.user.firstName} ${membership.member.user.lastName}`,
          planName: membership.plan.name,
          previousPlanName: previous.plan.name,
          startDate: membership.startDate,
          purchasePrice: format(membership.purchasePrice),
          gapDays: Math.round(
            (membership.startDate.getTime() - previous.endDate.getTime()) / 86_400_000 - 1,
          ),
          planChanged: membership.planId !== previous.planId,
        };
      });

    return {
      period,
      totalRenewals: rows.length,
      renewalValue: format(sum(renewed.map((membership) => membership.purchasePrice))),
      planChanges: rows.filter((row) => row.planChanged).length,
      lapsedWithoutRenewal,
      renewalRatePercent:
        endedInPeriod.length === 0
          ? null
          : Math.round(
              ((endedInPeriod.length - lapsedWithoutRenewal) / endedInPeriod.length) * 1000,
            ) / 10,
      renewals: rows,
    };
  }

  // -------------------------------------------------------------------------
  // Expired memberships
  // -------------------------------------------------------------------------

  async expiredMemberships(
    from: string,
    to: string,
    now: Date = new Date(),
  ): Promise<ExpiredMembershipsReportDto> {
    const period = this.period(from, to);
    await this.memberships.syncOverdue(now);

    const { start, end } = this.dates(from, to);
    const today = this.gymTime.localDateAsUtcMidnight(this.gymTime.today(now));

    const expired = await this.prisma.memberMembership.findMany({
      where: {
        endDate: { gte: start, lte: end },
        status: { in: [MembershipStatus.EXPIRED, MembershipStatus.CANCELLED] },
      },
      include: {
        plan: true,
        member: { include: { user: true } },
        renewedBy: { select: { id: true } },
      },
      orderBy: { endDate: 'desc' },
    });

    // "Returned" means any later membership, not only a formal renewal — a
    // member who simply bought again has come back.
    const memberIds = [...new Set(expired.map((membership) => membership.memberId))];
    const laterMemberships =
      memberIds.length === 0
        ? []
        : await this.prisma.memberMembership.findMany({
            where: { memberId: { in: memberIds }, startDate: { gt: start } },
            select: { memberId: true, startDate: true, id: true },
          });

    const rows = expired.map((membership) => {
      const returned =
        membership.renewedBy !== null ||
        laterMemberships.some(
          (later) =>
            later.memberId === membership.memberId &&
            later.id !== membership.id &&
            later.startDate.getTime() > membership.endDate.getTime(),
        );

      return {
        membershipId: membership.id,
        memberId: membership.memberId,
        memberCode: memberCode(membership.member.memberNumber),
        memberName: `${membership.member.user.firstName} ${membership.member.user.lastName}`,
        email: membership.member.user.email,
        planName: membership.plan.name,
        endDate: membership.endDate,
        status: membership.status,
        renewed: returned,
        daysSinceExpiry: Math.max(
          0,
          Math.round((today.getTime() - membership.endDate.getTime()) / 86_400_000),
        ),
      };
    });

    const returned = rows.filter((row) => row.renewed).length;

    return {
      period,
      totalExpired: rows.length,
      returned,
      notReturned: rows.length - returned,
      expired: rows,
    };
  }

  // -------------------------------------------------------------------------
  // Unpaid balances
  // -------------------------------------------------------------------------

  /** Delegates to BillingService so a debt is defined in exactly one place. */
  async unpaidBalances(limit: number): Promise<UnpaidBalancesReportDto> {
    const debtors = await this.billing.outstanding({
      page: 1,
      limit,
      skip: 0,
      take: limit,
    });

    const total = sum(debtors.data.map((debtor) => debtor.outstanding));

    return {
      membersInDebt: debtors.meta.total,
      totalOutstanding: format(total),
      averageOutstanding:
        debtors.data.length === 0
          ? format(ZERO)
          : format(total.dividedBy(debtors.data.length).toDecimalPlaces(2)),
      balances: debtors.data.map((debtor) => ({
        memberId: debtor.memberId,
        memberCode: debtor.memberCode,
        memberName: debtor.memberName,
        email: debtor.email,
        amountDue: debtor.amountDue,
        netPaid: debtor.netPaid,
        outstanding: debtor.outstanding,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Trainer stats
  // -------------------------------------------------------------------------

  async trainerStats(from: string, to: string): Promise<TrainerStatsReportDto> {
    const period = this.period(from, to);
    const { start, end } = this.instants(from, to);
    const dateBounds = this.dates(from, to);

    const trainers = await this.prisma.trainer.findMany({
      where: { status: ProfileStatus.ACTIVE },
      include: {
        user: true,
        _count: { select: { assignedMembers: true } },
      },
    });

    if (trainers.length === 0) {
      return { period, trainers: 0, stats: [] };
    }

    const trainerIds = trainers.map((trainer) => trainer.id);

    const [sessions, plans, costs] = await Promise.all([
      this.prisma.trainingSession.findMany({
        where: { trainerId: { in: trainerIds }, startsAt: { gte: start, lt: end } },
        select: {
          trainerId: true,
          status: true,
          startsAt: true,
          endsAt: true,
        },
      }),
      this.prisma.workoutPlan.groupBy({
        by: ['trainerId'],
        where: { trainerId: { in: trainerIds }, createdAt: { gte: start, lt: end } },
        _count: { _all: true },
      }),
      this.prisma.accountingEntry.groupBy({
        by: ['trainerId'],
        where: {
          trainerId: { in: trainerIds },
          type: AccountingEntryType.EXPENSE,
          voidedAt: null,
          occurredOn: { gte: dateBounds.start, lte: dateBounds.end },
        },
        _sum: { amount: true },
      }),
    ]);

    const plansByTrainer = new Map(plans.map((row) => [row.trainerId, row._count._all]));
    const costByTrainer = new Map(costs.map((row) => [row.trainerId, money(row._sum.amount ?? 0)]));

    const stats = trainers.map((trainer) => {
      const own = sessions.filter((session) => session.trainerId === trainer.id);

      const completed = own.filter((session) => session.status === TrainingSessionStatus.COMPLETED);
      const cancelled = own.filter(
        (session) => session.status === TrainingSessionStatus.CANCELLED,
      ).length;
      const noShows = own.filter(
        (session) => session.status === TrainingSessionStatus.NO_SHOW,
      ).length;

      // A cancellation freed the slot, so it was never "due"; a no-show was.
      const due = completed.length + noShows;

      return {
        trainerId: trainer.id,
        trainerCode: trainerCode(trainer.trainerNumber),
        trainerName: `${trainer.user.firstName} ${trainer.user.lastName}`,
        specialization: trainer.specialization,
        assignedMembers: trainer._count.assignedMembers,
        sessionsScheduled: own.length,
        sessionsCompleted: completed.length,
        sessionsCancelled: cancelled,
        noShows,
        completionRatePercent: due === 0 ? null : Math.round((completed.length / due) * 1000) / 10,
        coachedMinutes: completed.reduce(
          (total, session) => total + sessionDurationMinutes(session.startsAt, session.endsAt),
          0,
        ),
        plansWritten: plansByTrainer.get(trainer.id) ?? 0,
        attributedCost: format(costByTrainer.get(trainer.id) ?? ZERO),
      };
    });

    return {
      period,
      trainers: trainers.length,
      stats: stats.sort(
        (a, b) =>
          b.sessionsCompleted - a.sessionsCompleted || b.assignedMembers - a.assignedMembers,
      ),
    };
  }
}
