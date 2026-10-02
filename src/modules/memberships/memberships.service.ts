import { Injectable, Logger } from '@nestjs/common';
import {
  MembershipStatus,
  Prisma,
  ProfileStatus,
  UserRole,
  type MemberMembership,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { MembershipPlansService } from './membership-plans.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import { format, money } from '../../common/money/money';
import {
  OCCUPYING_STATUSES,
  computeEndDate,
  defaultRenewalStart,
  frozenDaysBetween,
  isTerminal,
  resolveStatus,
  toDateOnly,
  todayUtc,
} from './membership-period';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { MembershipWithRelations } from './dto/membership-response.dto';
import type {
  CancelMembershipDto,
  CreateMembershipDto,
  ExtendMembershipDto,
  FreezeMembershipDto,
  QueryMembershipsDto,
  RenewMembershipDto,
} from './dto/membership.dto';

const MEMBERSHIP_INCLUDE = {
  member: { include: { user: true } },
  plan: true,
} satisfies Prisma.MemberMembershipInclude;

const MEMBERSHIP_DETAIL_INCLUDE = {
  member: { include: { user: true } },
  plan: true,
  freezes: { orderBy: { startedAt: 'desc' } },
} satisfies Prisma.MemberMembershipInclude;

export interface StatusSyncResult {
  expired: number;
  activated: number;
}

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly plans: MembershipPlansService,
  ) {}

  // -------------------------------------------------------------------------
  // Status synchronisation
  //
  // Status is stored (so it can be filtered, counted and reported on) but is
  // really a function of today's date. These two methods keep the stored
  // value honest: `syncOne` before any read or decision about a single
  // membership, `syncOverdue` as a sweep.
  // -------------------------------------------------------------------------

  /** Persists a date-driven transition if the stored status has drifted. */
  private async syncOne<T extends MemberMembership>(membership: T, now = new Date()): Promise<T> {
    const effective = resolveStatus(membership, now);
    if (effective === membership.status) return membership;

    const updated = await this.prisma.memberMembership.update({
      where: { id: membership.id },
      data: { status: effective },
    });

    this.logger.log(
      `Membership ${membership.id} transitioned ${membership.status} -> ${effective}`,
    );

    return { ...membership, ...updated };
  }

  /**
   * Sweeps every membership whose stored status no longer matches the
   * calendar. Exposed to administrators and intended for a Phase 9 schedule.
   */
  async syncOverdue(now = new Date()): Promise<StatusSyncResult> {
    const today = todayUtc(now);

    const [expired, activated] = await this.prisma.$transaction([
      this.prisma.memberMembership.updateMany({
        where: {
          status: { in: [MembershipStatus.PENDING, MembershipStatus.ACTIVE] },
          endDate: { lt: today },
        },
        data: { status: MembershipStatus.EXPIRED },
      }),
      this.prisma.memberMembership.updateMany({
        where: {
          status: MembershipStatus.PENDING,
          startDate: { lte: today },
          endDate: { gte: today },
        },
        data: { status: MembershipStatus.ACTIVE },
      }),
    ]);

    if (expired.count > 0 || activated.count > 0) {
      this.logger.log(`Status sweep: ${expired.count} expired, ${activated.count} activated`);
    }

    return { expired: expired.count, activated: activated.count };
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Restricts membership queries by who may see the owning member. */
  private async scopeFor(principal: AuthenticatedUser): Promise<Prisma.MemberMembershipWhereInput> {
    if (principal.role === UserRole.ADMIN) return {};
    if (principal.role === UserRole.TRAINER) {
      return { member: await this.members.scopeFor(principal) };
    }
    return { member: { userId: principal.id } };
  }

  async findMany(
    query: QueryMembershipsDto,
    principal: AuthenticatedUser,
  ): Promise<PaginatedResult<MembershipWithRelations>> {
    await this.syncOverdue();

    const filters: Prisma.MemberMembershipWhereInput[] = [await this.scopeFor(principal)];

    if (query.memberId) filters.push({ memberId: query.memberId });
    if (query.planId) filters.push({ planId: query.planId });
    if (query.status) filters.push({ status: query.status });
    if (query.endingBefore)
      filters.push({ endDate: { lte: toDateOnly(new Date(query.endingBefore)) } });
    if (query.endingAfter)
      filters.push({ endDate: { gte: toDateOnly(new Date(query.endingAfter)) } });

    const where: Prisma.MemberMembershipWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.memberMembership.findMany({
        where,
        include: MEMBERSHIP_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.memberMembership.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  /**
   * One membership, within the caller's scope. Out of scope reports 404 so
   * membership ids cannot be probed.
   */
  async findOneScoped(id: string, principal: AuthenticatedUser): Promise<MembershipWithRelations> {
    const membership = await this.prisma.memberMembership.findFirst({
      where: { AND: [{ id }, await this.scopeFor(principal)] },
      include: MEMBERSHIP_DETAIL_INCLUDE,
    });

    if (!membership) throw new NotFoundError('Membership', id);

    const synced = await this.syncOne(membership);
    return { ...membership, status: synced.status };
  }

  async findOneOrFail(id: string): Promise<MembershipWithRelations> {
    const membership = await this.prisma.memberMembership.findUnique({
      where: { id },
      include: MEMBERSHIP_DETAIL_INCLUDE,
    });

    if (!membership) throw new NotFoundError('Membership', id);

    const synced = await this.syncOne(membership);
    return { ...membership, status: synced.status };
  }

  /** A member's full membership history, newest first. */
  async findHistoryForMember(
    memberId: string,
    query: QueryMembershipsDto,
  ): Promise<PaginatedResult<MembershipWithRelations>> {
    await this.syncOverdue();

    const filters: Prisma.MemberMembershipWhereInput[] = [{ memberId }];
    if (query.status) filters.push({ status: query.status });

    const where: Prisma.MemberMembershipWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.memberMembership.findMany({
        where,
        include: MEMBERSHIP_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.memberMembership.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  /**
   * The membership that should decide a door entry.
   *
   * Prefers a usable membership, then falls back to the most informative
   * unusable one — so a member with a lapsed membership is told it expired
   * rather than that they have none at all. Statuses are reconciled first, so
   * the answer reflects today's date.
   */
  async findRelevantForEntry(memberId: string): Promise<MembershipWithRelations | null> {
    await this.syncOverdue();

    const byPriority: MembershipStatus[][] = [
      [MembershipStatus.ACTIVE],
      [MembershipStatus.FROZEN],
      [MembershipStatus.PENDING],
      [MembershipStatus.EXPIRED, MembershipStatus.CANCELLED],
    ];

    for (const statuses of byPriority) {
      const found = await this.prisma.memberMembership.findFirst({
        where: { memberId, status: { in: statuses } },
        include: MEMBERSHIP_INCLUDE,
        orderBy: { endDate: 'desc' },
      });

      if (found) return found;
    }

    return null;
  }

  /**
   * Consumes one visit from a limited allowance, inside the caller's
   * transaction so the attendance row and the decrement cannot diverge.
   */
  async consumeVisit(tx: Prisma.TransactionClient, membershipId: string): Promise<void> {
    await tx.memberMembership.update({
      where: { id: membershipId },
      data: { visitsUsed: { increment: 1 } },
    });
  }

  /** Releases a visit back, used when a check-in is reversed. */
  async releaseVisit(tx: Prisma.TransactionClient, membershipId: string): Promise<void> {
    await tx.memberMembership.update({
      where: { id: membershipId },
      data: { visitsUsed: { decrement: 1 } },
    });
  }

  /** The membership a member can use right now, if any. */
  async findCurrentForMember(memberId: string): Promise<MembershipWithRelations | null> {
    await this.syncOverdue();

    return this.prisma.memberMembership.findFirst({
      where: { memberId, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN] } },
      include: MEMBERSHIP_DETAIL_INCLUDE,
      orderBy: { endDate: 'desc' },
    });
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async create(dto: CreateMembershipDto): Promise<MembershipWithRelations> {
    const member = await this.members.findOneOrFail(dto.memberId);

    if (member.status !== ProfileStatus.ACTIVE) {
      throw new BusinessRuleError('Cannot sell a membership to an archived member', [
        { field: 'memberId', messages: ['member must be active'] },
      ]);
    }

    const plan = await this.plans.findSellableOrFail(dto.planId);

    const startDate = dto.startDate ? toDateOnly(new Date(dto.startDate)) : todayUtc();
    const endDate = computeEndDate(startDate, plan.durationDays);

    await this.assertNoOverlap(dto.memberId, startDate, endDate);

    const created = await this.prisma.memberMembership.create({
      data: {
        memberId: dto.memberId,
        planId: plan.id,
        // Captured now, so a later plan price change cannot rewrite this sale.
        purchasePrice:
          dto.purchasePrice !== undefined ? new Prisma.Decimal(dto.purchasePrice) : plan.price,
        visitLimit: plan.visitLimit,
        startDate,
        endDate,
        status: resolveStatus({ status: MembershipStatus.ACTIVE, startDate, endDate }),
        notes: dto.notes ?? null,
      },
      include: MEMBERSHIP_DETAIL_INCLUDE,
    });

    this.logger.log(
      `Sold membership ${created.id} (plan '${plan.name}', ${created.purchasePrice.toFixed(2)}) to member ${dto.memberId}`,
    );
    return created;
  }

  /**
   * Starts a fresh term for the same member, chained to the one being
   * renewed. The price is taken from the plan as it stands today — the old
   * membership keeps whatever was paid for it.
   */
  async renew(id: string, dto: RenewMembershipDto): Promise<MembershipWithRelations> {
    const current = await this.findOneOrFail(id);

    if (current.status === MembershipStatus.CANCELLED) {
      throw new BusinessRuleError(
        'A cancelled membership cannot be renewed; sell a new membership instead',
      );
    }

    if (await this.hasRenewal(id)) {
      throw new ConflictError(`Membership '${id}' has already been renewed`);
    }

    const member = await this.members.findOneOrFail(current.memberId);
    if (member.status !== ProfileStatus.ACTIVE) {
      throw new BusinessRuleError('Cannot renew a membership for an archived member');
    }

    const plan = await this.plans.findSellableOrFail(dto.planId ?? current.planId);

    const startDate = dto.startDate
      ? toDateOnly(new Date(dto.startDate))
      : defaultRenewalStart(current.endDate);
    const endDate = computeEndDate(startDate, plan.durationDays);

    await this.assertNoOverlap(current.memberId, startDate, endDate, id);

    const renewed = await this.prisma.memberMembership.create({
      data: {
        memberId: current.memberId,
        planId: plan.id,
        purchasePrice:
          dto.purchasePrice !== undefined ? new Prisma.Decimal(dto.purchasePrice) : plan.price,
        visitLimit: plan.visitLimit,
        startDate,
        endDate,
        status: resolveStatus({ status: MembershipStatus.ACTIVE, startDate, endDate }),
        previousMembershipId: current.id,
        notes: dto.notes ?? null,
      },
      include: MEMBERSHIP_DETAIL_INCLUDE,
    });

    this.logger.log(`Renewed membership ${id} as ${renewed.id} (plan '${plan.name}')`);
    return renewed;
  }

  /** Pushes the end date out. Can revive an expired membership. */
  async extend(id: string, dto: ExtendMembershipDto): Promise<MembershipWithRelations> {
    const membership = await this.findOneOrFail(id);

    if (membership.status === MembershipStatus.CANCELLED) {
      throw new BusinessRuleError('A cancelled membership cannot be extended');
    }

    const endDate = new Date(membership.endDate.getTime() + dto.days * 86_400_000);
    await this.assertNoOverlap(membership.memberId, membership.startDate, endDate, id);

    const updated = await this.prisma.memberMembership.update({
      where: { id },
      data: {
        endDate,
        extendedDays: { increment: dto.days },
        // Seeded with ACTIVE rather than the stored status so the dates decide:
        // this is the one deliberate path that revives an expired membership.
        // A frozen membership stays frozen; a cancelled one never reaches here.
        status:
          membership.status === MembershipStatus.FROZEN
            ? MembershipStatus.FROZEN
            : resolveStatus({
                status: MembershipStatus.ACTIVE,
                startDate: membership.startDate,
                endDate,
              }),
      },
      include: MEMBERSHIP_DETAIL_INCLUDE,
    });

    this.logger.log(
      `Extended membership ${id} by ${dto.days} day(s)${dto.reason ? ` (${dto.reason})` : ''}`,
    );
    return updated;
  }

  /** Pauses the clock. The end date moves out when it resumes, not now. */
  async freeze(id: string, dto: FreezeMembershipDto): Promise<MembershipWithRelations> {
    const membership = await this.findOneOrFail(id);

    if (membership.status === MembershipStatus.FROZEN) {
      throw new ConflictError(`Membership '${id}' is already frozen`);
    }

    if (isTerminal(membership.status)) {
      throw new BusinessRuleError(
        `A membership that is ${membership.status.toLowerCase()} cannot be frozen`,
      );
    }

    const frozenAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.membershipFreeze.create({
        data: { membershipId: id, startedAt: frozenAt, reason: dto.reason ?? null },
      });

      return tx.memberMembership.update({
        where: { id },
        data: { status: MembershipStatus.FROZEN, frozenAt },
        include: MEMBERSHIP_DETAIL_INCLUDE,
      });
    });

    this.logger.log(`Froze membership ${id}${dto.reason ? ` (${dto.reason})` : ''}`);
    return updated;
  }

  /**
   * Resumes a frozen membership, crediting back every whole day it was
   * paused so the member loses none of what they bought.
   */
  async unfreeze(id: string): Promise<MembershipWithRelations> {
    const membership = await this.findOneOrFail(id);

    if (membership.status !== MembershipStatus.FROZEN) {
      throw new ConflictError(`Membership '${id}' is not frozen`);
    }

    const resumedAt = new Date();
    const frozenDays = frozenDaysBetween(membership.frozenAt ?? resumedAt, resumedAt);
    const endDate = new Date(membership.endDate.getTime() + frozenDays * 86_400_000);

    const updated = await this.prisma.$transaction(async (tx) => {
      const openFreeze = await tx.membershipFreeze.findFirst({
        where: { membershipId: id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });

      if (openFreeze) {
        await tx.membershipFreeze.update({
          where: { id: openFreeze.id },
          data: { endedAt: resumedAt, days: frozenDays },
        });
      }

      return tx.memberMembership.update({
        where: { id },
        data: {
          status: resolveStatus(
            { status: MembershipStatus.ACTIVE, startDate: membership.startDate, endDate },
            resumedAt,
          ),
          frozenAt: null,
          endDate,
          totalFrozenDays: { increment: frozenDays },
        },
        include: MEMBERSHIP_DETAIL_INCLUDE,
      });
    });

    this.logger.log(`Unfroze membership ${id}; credited ${frozenDays} day(s)`);
    return updated;
  }

  /** Ends a membership early. Terminal. */
  async cancel(id: string, dto: CancelMembershipDto): Promise<MembershipWithRelations> {
    const membership = await this.findOneOrFail(id);

    if (membership.status === MembershipStatus.CANCELLED) {
      throw new ConflictError(`Membership '${id}' is already cancelled`);
    }

    const cancelledAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      // Close an open freeze so the history has no dangling episode.
      await tx.membershipFreeze.updateMany({
        where: { membershipId: id, endedAt: null },
        data: { endedAt: cancelledAt, days: 0 },
      });

      return tx.memberMembership.update({
        where: { id },
        data: {
          status: MembershipStatus.CANCELLED,
          cancelledAt,
          cancellationReason: dto.reason ?? null,
          frozenAt: null,
        },
        include: MEMBERSHIP_DETAIL_INCLUDE,
      });
    });

    this.logger.log(`Cancelled membership ${id}${dto.reason ? ` (${dto.reason})` : ''}`);
    return updated;
  }

  /** Forces a membership to EXPIRED ahead of its end date. */
  async expire(id: string): Promise<MembershipWithRelations> {
    const membership = await this.findOneOrFail(id);

    if (membership.status === MembershipStatus.EXPIRED) {
      throw new ConflictError(`Membership '${id}' has already expired`);
    }

    if (membership.status === MembershipStatus.CANCELLED) {
      throw new BusinessRuleError('A cancelled membership cannot be expired');
    }

    const today = todayUtc();
    // Pull the end date back so the stored status and the calendar agree;
    // otherwise the next status sweep would revive it.
    const endDate = today.getTime() < membership.endDate.getTime() ? today : membership.endDate;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.membershipFreeze.updateMany({
        where: { membershipId: id, endedAt: null },
        data: { endedAt: new Date(), days: 0 },
      });

      return tx.memberMembership.update({
        where: { id },
        data: { status: MembershipStatus.EXPIRED, endDate, frozenAt: null },
        include: MEMBERSHIP_DETAIL_INCLUDE,
      });
    });

    this.logger.log(`Expired membership ${id} early`);
    return updated;
  }

  /**
   * Grants or clears a reduction off the purchase price.
   *
   * The discount lives on the membership rather than on a payment because it
   * changes what is *owed*, not what was received — so the amount due is
   * purchasePrice - discountAmount, and the billing figures follow from that.
   * A discount larger than the price is refused rather than silently clamped.
   */
  async applyDiscount(
    id: string,
    amount: number,
    reason?: string,
  ): Promise<MembershipWithRelations> {
    const membership = await this.findOneOrFail(id);
    const discount = money(amount);

    if (discount.greaterThan(membership.purchasePrice)) {
      throw new BusinessRuleError(
        `A discount of ${format(discount)} exceeds the ${format(membership.purchasePrice)} purchase price`,
        [{ field: 'amount', messages: ['must not exceed the purchase price'] }],
      );
    }

    const updated = await this.prisma.memberMembership.update({
      where: { id },
      data: {
        discountAmount: discount,
        discountReason: discount.isZero() ? null : (reason ?? null),
      },
      include: MEMBERSHIP_DETAIL_INCLUDE,
    });

    this.logger.log(
      discount.isZero()
        ? `Removed the discount on membership ${id}`
        : `Applied a ${format(discount)} discount to membership ${id}${reason ? ` (${reason})` : ''}`,
    );

    return updated;
  }

  // -------------------------------------------------------------------------
  // Invariants
  // -------------------------------------------------------------------------

  /**
   * A member may hold only one live membership over any given day. Without
   * this, visit allowances and revenue reports would double-count.
   * Back-to-back terms are fine — only true overlap is rejected.
   */
  private async assertNoOverlap(
    memberId: string,
    startDate: Date,
    endDate: Date,
    excludeMembershipId?: string,
  ): Promise<void> {
    const clash = await this.prisma.memberMembership.findFirst({
      where: {
        memberId,
        status: { in: [...OCCUPYING_STATUSES] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(excludeMembershipId ? { id: { not: excludeMembershipId } } : {}),
      },
      select: { id: true, startDate: true, endDate: true },
    });

    if (clash) {
      const from = clash.startDate.toISOString().slice(0, 10);
      const to = clash.endDate.toISOString().slice(0, 10);
      throw new BusinessRuleError(
        `This member already has a membership covering ${from} to ${to}`,
        [{ field: 'startDate', messages: ['overlaps an existing membership'] }],
      );
    }
  }

  private async hasRenewal(membershipId: string): Promise<boolean> {
    const renewal = await this.prisma.memberMembership.findFirst({
      where: { previousMembershipId: membershipId },
      select: { id: true },
    });

    return renewal !== null;
  }
}
