import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  ProfileStatus,
  TrainingSessionStatus,
  WorkoutPlanStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GymTimeService } from '../../common/time/gym-time.service';
import { MembershipsService } from '../memberships/memberships.service';
import { AccountingService } from '../accounting/accounting.service';
import { BillingService } from '../payments/billing.service';
import { MemberAccessService } from '../workouts/member-access.service';
import { NotFoundError } from '../../common/errors/app.exception';
import { format, money } from '../../common/money/money';
import { memberCode, trainerCode } from '../../common/profiles/profile-code';
import { daysRemaining, visitsRemaining } from '../memberships/membership-period';
import type {
  AdminDashboardDto,
  MemberActivityDto,
  MemberDashboardDto,
  SessionSummaryDto,
  TrainerDashboardDto,
} from './dto/dashboard.dto';

/** Live statuses — the memberships that let someone in or will soon. */
const LIVE_STATUSES = [MembershipStatus.ACTIVE, MembershipStatus.FROZEN, MembershipStatus.PENDING];

/** A member not seen for this long is worth a trainer's call. */
const STALE_VISIT_DAYS = 14;

/**
 * Which of a member's live memberships describes them *today*.
 *
 * A member part-way through one term with the next already queued holds both
 * an ACTIVE and a PENDING membership. Ordering by end date would pick the
 * queued one and report them as not yet started, which is both wrong and
 * alarming on a trainer's screen. Usability today wins over chronology.
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

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gymTime: GymTimeService,
    private readonly memberships: MembershipsService,
    private readonly accounting: AccountingService,
    private readonly billing: BillingService,
    private readonly access: MemberAccessService,
  ) {}

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  async admin(withinDays: number, now: Date = new Date()): Promise<AdminDashboardDto> {
    // Reconcile statuses first, so "active" and "expired" reflect today rather
    // than whenever the sweep last ran.
    await this.memberships.syncOverdue(now);

    const today = this.gymTime.today(now);
    const { from: monthFrom, to: monthTo } = this.gymTime.currentMonthDates(now);
    const todayDate = this.gymTime.localDateAsUtcMidnight(today);
    const horizon = this.gymTime.localDateAsUtcMidnight(this.gymTime.shift(today, withinDays));
    const monthStart = this.gymTime.range(monthFrom, monthTo).start;
    const monthEnd = this.gymTime.range(monthFrom, monthTo).end;
    const dayWindow = this.gymTime.day(today);

    const [
      totalMembers,
      activeMembers,
      membersWithoutMembership,
      expiringSoon,
      attendanceToday,
      currentlyInside,
      financials,
      outstanding,
      newMembersThisMonth,
      membershipsSoldThisMonth,
      activeTrainers,
      sessionsToday,
    ] = await Promise.all([
      this.prisma.member.count({ where: { status: ProfileStatus.ACTIVE } }),
      this.prisma.member.count({
        where: {
          status: ProfileStatus.ACTIVE,
          memberships: { some: { status: MembershipStatus.ACTIVE } },
        },
      }),
      this.prisma.member.count({
        where: { status: ProfileStatus.ACTIVE, memberships: { none: {} } },
      }),
      this.prisma.memberMembership.findMany({
        where: {
          status: MembershipStatus.ACTIVE,
          endDate: { gte: todayDate, lte: horizon },
        },
        include: { member: { include: { user: true } }, plan: true },
        orderBy: { endDate: 'asc' },
      }),
      this.prisma.attendance.count({
        where: { checkedInAt: { gte: dayWindow.start, lt: dayWindow.end } },
      }),
      this.prisma.attendance.count({ where: { checkedOutAt: null } }),
      this.accounting.totalsForPeriod(
        this.gymTime.localDateAsUtcMidnight(monthFrom),
        this.gymTime.localDateAsUtcMidnight(monthTo),
      ),
      this.billing.outstanding({ page: 1, limit: 5, skip: 0, take: 5 }),
      this.prisma.member.count({
        where: { status: ProfileStatus.ACTIVE, joinedAt: { gte: monthStart, lt: monthEnd } },
      }),
      this.prisma.memberMembership.count({
        where: { createdAt: { gte: monthStart, lt: monthEnd } },
      }),
      this.prisma.trainer.count({ where: { status: ProfileStatus.ACTIVE } }),
      this.prisma.trainingSession.count({
        where: {
          startsAt: { gte: dayWindow.start, lt: dayWindow.end },
          status: { in: [TrainingSessionStatus.SCHEDULED, TrainingSessionStatus.COMPLETED] },
        },
      }),
    ]);

    // An expired member is one with no live membership who has had at least one.
    const expiredMembers = await this.prisma.member.count({
      where: {
        status: ProfileStatus.ACTIVE,
        memberships: { some: {} },
        NOT: { memberships: { some: { status: { in: LIVE_STATUSES } } } },
      },
    });

    const totalOutstanding = outstanding.data.reduce(
      (total, debtor) => total.plus(money(debtor.outstanding)),
      money(0),
    );

    return {
      date: today,
      timeZone: this.gymTime.zone,
      month: monthFrom.slice(0, 7),
      activeMembers,
      expiredMembers,
      totalMembers,
      membersWithoutMembership,
      expiringSoonCount: expiringSoon.length,
      expiringSoon: expiringSoon.map((membership) => ({
        membershipId: membership.id,
        memberId: membership.memberId,
        memberCode: memberCode(membership.member.memberNumber),
        memberName: `${membership.member.user.firstName} ${membership.member.user.lastName}`,
        planName: membership.plan.name,
        endDate: membership.endDate,
        daysRemaining: daysRemaining(membership, now) ?? 0,
      })),
      todayCheckIns: attendanceToday,
      currentlyInside,
      monthlyRevenue: format(financials.revenue),
      monthlyExpenses: format(financials.expenses),
      monthlyProfit: format(financials.profit),
      // `meta.total` counts every debtor; the page itself is the top five.
      totalOutstanding: format(totalOutstanding),
      membersInDebt: outstanding.meta.total,
      topDebtors: outstanding.data.map((debtor) => ({
        memberId: debtor.memberId,
        memberCode: debtor.memberCode,
        memberName: debtor.memberName,
        outstanding: debtor.outstanding,
      })),
      newMembersThisMonth,
      membershipsSoldThisMonth,
      activeTrainers,
      sessionsToday,
    };
  }

  // -------------------------------------------------------------------------
  // Trainer
  // -------------------------------------------------------------------------

  async trainer(userId: string, now: Date = new Date()): Promise<TrainerDashboardDto> {
    await this.memberships.syncOverdue(now);

    const trainer = await this.prisma.trainer.findUnique({ where: { userId } });
    if (!trainer) throw new NotFoundError('Trainer profile for the current account');

    const today = this.gymTime.today(now);
    const dayWindow = this.gymTime.day(today);
    const { from: monthFrom, to: monthTo } = this.gymTime.currentMonthDates(now);
    const monthWindow = this.gymTime.range(monthFrom, monthTo);

    const [
      assigned,
      sessionsToday,
      upcomingSessions,
      sessionsCompletedThisMonth,
      noShowsThisMonth,
      activeWorkoutPlans,
    ] = await Promise.all([
      this.prisma.member.findMany({
        where: { assignedTrainerId: trainer.id, status: ProfileStatus.ACTIVE },
        include: {
          user: true,
          memberships: { where: { status: { in: LIVE_STATUSES } }, orderBy: { endDate: 'desc' } },
        },
      }),
      this.prisma.trainingSession.findMany({
        where: {
          trainerId: trainer.id,
          startsAt: { gte: dayWindow.start, lt: dayWindow.end },
        },
        include: { member: { include: { user: true } } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.trainingSession.findMany({
        where: {
          trainerId: trainer.id,
          status: TrainingSessionStatus.SCHEDULED,
          startsAt: { gte: dayWindow.end },
        },
        include: { member: { include: { user: true } } },
        orderBy: { startsAt: 'asc' },
        take: 10,
      }),
      this.prisma.trainingSession.count({
        where: {
          trainerId: trainer.id,
          status: TrainingSessionStatus.COMPLETED,
          startsAt: { gte: monthWindow.start, lt: monthWindow.end },
        },
      }),
      this.prisma.trainingSession.count({
        where: {
          trainerId: trainer.id,
          status: TrainingSessionStatus.NO_SHOW,
          startsAt: { gte: monthWindow.start, lt: monthWindow.end },
        },
      }),
      this.prisma.workoutPlan.count({
        where: { trainerId: trainer.id, status: WorkoutPlanStatus.ACTIVE },
      }),
    ]);

    const memberActivity = await this.buildMemberActivity(assigned, monthWindow, today);

    return {
      date: today,
      timeZone: this.gymTime.zone,
      trainerId: trainer.id,
      trainerCode: trainerCode(trainer.trainerNumber),
      assignedMembers: assigned.length,
      assignedMembersActive: assigned.filter((member) =>
        member.memberships.some((membership) => membership.status === MembershipStatus.ACTIVE),
      ).length,
      sessionsToday: sessionsToday.map((session) => DashboardsService.toSessionSummary(session)),
      upcomingSessions: upcomingSessions.map((session) =>
        DashboardsService.toSessionSummary(session),
      ),
      sessionsCompletedThisMonth,
      noShowsThisMonth,
      activeWorkoutPlans,
      memberActivity,
    };
  }

  /**
   * Who has been in lately, least recently seen first — so the trainer's first
   * screen surfaces the members drifting away rather than the keen ones.
   */
  private async buildMemberActivity(
    assigned: Array<{
      id: string;
      memberNumber: number;
      user: { firstName: string; lastName: string };
      memberships: Array<{ status: MembershipStatus }>;
    }>,
    monthWindow: { start: Date; end: Date },
    today: string,
  ): Promise<MemberActivityDto[]> {
    if (assigned.length === 0) return [];

    const memberIds = assigned.map((member) => member.id);

    const [lastVisits, monthVisits] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['memberId'],
        where: { memberId: { in: memberIds } },
        _max: { checkedInAt: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['memberId'],
        where: {
          memberId: { in: memberIds },
          checkedInAt: { gte: monthWindow.start, lt: monthWindow.end },
        },
        _count: { _all: true },
      }),
    ]);

    const lastVisitByMember = new Map(
      lastVisits.map((row) => [row.memberId, row._max.checkedInAt]),
    );
    const monthCountByMember = new Map(monthVisits.map((row) => [row.memberId, row._count._all]));

    const activity = assigned.map((member) => {
      const lastVisitAt = lastVisitByMember.get(member.id) ?? null;
      const daysSince = lastVisitAt
        ? Math.max(
            0,
            Math.round(
              (this.gymTime.localDateAsUtcMidnight(today).getTime() -
                this.gymTime
                  .localDateAsUtcMidnight(this.gymTime.localDateOf(lastVisitAt))
                  .getTime()) /
                86_400_000,
            ),
          )
        : null;

      const membershipStatus = representativeStatus(member.memberships);

      return {
        memberId: member.id,
        memberCode: memberCode(member.memberNumber),
        memberName: `${member.user.firstName} ${member.user.lastName}`,
        lastVisitAt,
        daysSinceLastVisit: daysSince,
        visitsThisMonth: monthCountByMember.get(member.id) ?? 0,
        membershipStatus,
        // Never been in, or not for a fortnight.
        needsAttention: daysSince === null || daysSince >= STALE_VISIT_DAYS,
      };
    });

    return activity.sort((a, b) => {
      if (a.lastVisitAt === null && b.lastVisitAt === null) return 0;
      if (a.lastVisitAt === null) return -1;
      if (b.lastVisitAt === null) return 1;
      return a.lastVisitAt.getTime() - b.lastVisitAt.getTime();
    });
  }

  // -------------------------------------------------------------------------
  // Member
  // -------------------------------------------------------------------------

  async member(userId: string, now: Date = new Date()): Promise<MemberDashboardDto> {
    await this.memberships.syncOverdue(now);

    const memberId = await this.access.ownMemberId(userId);

    const member = await this.prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      include: {
        user: true,
        assignedTrainer: { include: { user: true } },
      },
    });

    const today = this.gymTime.today(now);
    const { from: monthFrom, to: monthTo } = this.gymTime.currentMonthDates(now);
    const monthWindow = this.gymTime.range(monthFrom, monthTo);

    const [
      membership,
      visitsThisMonth,
      visitsAllTime,
      lastVisit,
      openVisit,
      nextSession,
      plan,
      billing,
    ] = await Promise.all([
      this.memberships.findRelevantForEntry(memberId),
      this.prisma.attendance.count({
        where: { memberId, checkedInAt: { gte: monthWindow.start, lt: monthWindow.end } },
      }),
      this.prisma.attendance.count({ where: { memberId } }),
      this.prisma.attendance.findFirst({
        where: { memberId },
        orderBy: { checkedInAt: 'desc' },
        select: { checkedInAt: true },
      }),
      this.prisma.attendance.findFirst({ where: { memberId, checkedOutAt: null } }),
      this.prisma.trainingSession.findFirst({
        where: {
          memberId,
          status: TrainingSessionStatus.SCHEDULED,
          startsAt: { gte: now },
        },
        include: { member: { include: { user: true } } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.workoutPlan.findFirst({
        where: { memberId, status: WorkoutPlanStatus.ACTIVE },
        include: { days: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.billing.forUser(userId),
    ]);

    const remainingVisits = membership
      ? visitsRemaining(membership.visitLimit, membership.visitsUsed)
      : null;

    return {
      date: today,
      timeZone: this.gymTime.zone,
      memberId: member.id,
      memberCode: memberCode(member.memberNumber),
      memberName: `${member.user.firstName} ${member.user.lastName}`,
      membershipStatus: membership?.status ?? null,
      membershipPlanName: membership?.plan.name ?? null,
      membershipEndDate: membership?.endDate ?? null,
      daysRemaining: membership ? daysRemaining(membership, now) : null,
      visitsRemaining: remainingVisits,
      unlimitedVisits: membership ? membership.visitLimit === null : false,
      // The same conditions the door applies, so the figure never contradicts
      // what happens when they turn up.
      canCheckInNow:
        membership?.status === MembershipStatus.ACTIVE &&
        openVisit === null &&
        (remainingVisits === null || remainingVisits > 0),
      assignedTrainer: member.assignedTrainer
        ? {
            trainerId: member.assignedTrainer.id,
            trainerCode: trainerCode(member.assignedTrainer.trainerNumber),
            name: `${member.assignedTrainer.user.firstName} ${member.assignedTrainer.user.lastName}`,
            specialization: member.assignedTrainer.specialization,
          }
        : null,
      visitsThisMonth,
      visitsAllTime,
      lastVisitAt: lastVisit?.checkedInAt ?? null,
      currentlyInside: openVisit !== null,
      nextSession: nextSession ? DashboardsService.toSessionSummary(nextSession) : null,
      workoutPlanId: plan?.id ?? null,
      workoutPlanName: plan?.name ?? null,
      workoutPlanDays: plan ? plan.days.length : null,
      outstandingBalance: billing.outstanding,
    };
  }

  private static toSessionSummary(session: {
    id: string;
    memberId: string;
    startsAt: Date;
    endsAt: Date;
    status: TrainingSessionStatus;
    location: string | null;
    member: { memberNumber: number; user: { firstName: string; lastName: string } };
  }): SessionSummaryDto {
    return {
      sessionId: session.id,
      memberId: session.memberId,
      memberCode: memberCode(session.member.memberNumber),
      memberName: `${session.member.user.firstName} ${session.member.user.lastName}`,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      status: session.status,
      location: session.location,
    };
  }
}
