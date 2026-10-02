import { Injectable, Logger } from '@nestjs/common';
import {
  MembershipPlanStatus,
  MembershipStatus,
  Prisma,
  UserRole,
  type MembershipPlan,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import { OCCUPYING_STATUSES } from './membership-period';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type {
  CreateMembershipPlanDto,
  QueryMembershipPlansDto,
  UpdateMembershipPlanDto,
} from './dto/membership-plan.dto';

@Injectable()
export class MembershipPlansService {
  private readonly logger = new Logger(MembershipPlansService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Archived plans are an administrative concern. Everybody else sees only
   * what is currently on sale.
   */
  private static visibilityFor(principal: AuthenticatedUser): Prisma.MembershipPlanWhereInput {
    return principal.role === UserRole.ADMIN ? {} : { status: MembershipPlanStatus.ACTIVE };
  }

  async findMany(
    query: QueryMembershipPlansDto,
    principal: AuthenticatedUser,
  ): Promise<PaginatedResult<MembershipPlan>> {
    const filters: Prisma.MembershipPlanWhereInput[] = [
      MembershipPlansService.visibilityFor(principal),
    ];

    // Always applied. Combined with the visibility filter, a non-administrator
    // asking for ARCHIVED gets an empty list — the honest answer — rather than
    // silently receiving the active plans instead.
    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.search) {
      filters.push({ name: { contains: query.search, mode: Prisma.QueryMode.insensitive } });
    }

    const where: Prisma.MembershipPlanWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.membershipPlan.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.membershipPlan.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOneVisible(id: string, principal: AuthenticatedUser): Promise<MembershipPlan> {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { AND: [{ id }, MembershipPlansService.visibilityFor(principal)] },
    });

    if (!plan) throw new NotFoundError('Membership plan', id);
    return plan;
  }

  async findOneOrFail(id: string): Promise<MembershipPlan> {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundError('Membership plan', id);
    return plan;
  }

  /** A plan must be on sale before a membership can be sold on it. */
  async findSellableOrFail(id: string): Promise<MembershipPlan> {
    const plan = await this.findOneOrFail(id);

    if (plan.status !== MembershipPlanStatus.ACTIVE) {
      throw new BusinessRuleError(`Membership plan '${plan.name}' is archived and cannot be sold`, [
        { field: 'planId', messages: ['plan must be active'] },
      ]);
    }

    return plan;
  }

  async create(dto: CreateMembershipPlanDto): Promise<MembershipPlan> {
    await this.assertNameAvailable(dto.name);

    const plan = await this.prisma.membershipPlan.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        durationDays: dto.durationDays,
        price: new Prisma.Decimal(dto.price),
        visitLimit: dto.visitLimit ?? null,
        displayOrder: dto.displayOrder ?? 0,
      },
    });

    this.logger.log(`Created membership plan '${plan.name}' (${plan.durationDays}d)`);
    return plan;
  }

  /**
   * Editing a plan never touches memberships already sold on it — price and
   * visit allowance were copied at purchase.
   */
  async update(id: string, dto: UpdateMembershipPlanDto): Promise<MembershipPlan> {
    const plan = await this.findOneOrFail(id);

    if (dto.name !== undefined && dto.name !== plan.name) {
      await this.assertNameAvailable(dto.name);
    }

    return this.prisma.membershipPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.durationDays !== undefined ? { durationDays: dto.durationDays } : {}),
        ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
        ...(dto.visitLimit !== undefined ? { visitLimit: dto.visitLimit } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
      },
    });
  }

  /**
   * Retires a plan from sale. Existing memberships keep running — the plan
   * relation is RESTRICT precisely so history cannot be deleted out from
   * under them.
   */
  async archive(id: string): Promise<MembershipPlan> {
    const plan = await this.findOneOrFail(id);

    if (plan.status === MembershipPlanStatus.ARCHIVED) {
      throw new ConflictError(`Membership plan '${plan.name}' is already archived`);
    }

    const archived = await this.prisma.membershipPlan.update({
      where: { id },
      data: { status: MembershipPlanStatus.ARCHIVED, archivedAt: new Date() },
    });

    const stillRunning = await this.prisma.memberMembership.count({
      where: { planId: id, status: { in: [...OCCUPYING_STATUSES] } },
    });

    this.logger.log(
      `Archived membership plan '${plan.name}'; ${stillRunning} membership(s) still running on it`,
    );
    return archived;
  }

  async reactivate(id: string): Promise<MembershipPlan> {
    const plan = await this.findOneOrFail(id);

    if (plan.status === MembershipPlanStatus.ACTIVE) {
      throw new ConflictError(`Membership plan '${plan.name}' is already active`);
    }

    return this.prisma.membershipPlan.update({
      where: { id },
      data: { status: MembershipPlanStatus.ACTIVE, archivedAt: null },
    });
  }

  /** How many memberships exist on a plan, by status. Used by the archive view. */
  async countMembershipsByStatus(planId: string): Promise<Record<MembershipStatus, number>> {
    const grouped = await this.prisma.memberMembership.groupBy({
      by: ['status'],
      where: { planId },
      _count: { _all: true },
    });

    const counts = Object.fromEntries(
      Object.values(MembershipStatus).map((status) => [status, 0]),
    ) as Record<MembershipStatus, number>;

    for (const row of grouped) {
      counts[row.status] = row._count._all;
    }

    return counts;
  }

  private async assertNameAvailable(name: string): Promise<void> {
    const existing = await this.prisma.membershipPlan.findUnique({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError(`A membership plan named '${name}' already exists`, [
        { field: 'name', messages: ['must be unique'] },
      ]);
    }
  }
}
