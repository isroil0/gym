import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ProfileStatus,
  UserRole,
  UserStatus,
  type Member,
  type Trainer,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountProvisioningService } from '../users/account-provisioning.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { CreateMemberDto } from './dto/create-member.dto';
import type { UpdateMemberDto, UpdateOwnMemberProfileDto } from './dto/update-member.dto';
import type { QueryMembersDto } from './dto/query-members.dto';
import type { MemberWithRelations } from './dto/member-response.dto';

/** Everything a member response needs, loaded in one query. */
const MEMBER_INCLUDE = {
  user: true,
  assignedTrainer: { include: { user: true } },
} satisfies Prisma.MemberInclude;

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountProvisioningService,
  ) {}

  // -------------------------------------------------------------------------
  // Authorization scope
  // -------------------------------------------------------------------------

  /**
   * The `where` fragment that limits what a principal may see.
   *
   * ADMIN sees every member. A TRAINER sees only the members assigned to
   * them. A MEMBER never reaches the collection endpoints — their own record
   * is served by the dedicated /members/me routes.
   *
   * Public so sibling modules (memberships, and later attendance and
   * workouts) can apply the identical rule through a relation filter rather
   * than reimplementing it.
   */
  async scopeFor(principal: AuthenticatedUser): Promise<Prisma.MemberWhereInput> {
    if (principal.role === UserRole.ADMIN) return {};

    if (principal.role === UserRole.TRAINER) {
      const trainer = await this.prisma.trainer.findUnique({
        where: { userId: principal.id },
        select: { id: true },
      });

      // A trainer account with no profile yet can see nothing rather than
      // everything — failing closed.
      return { assignedTrainerId: trainer?.id ?? '00000000-0000-0000-0000-000000000000' };
    }

    return { id: '00000000-0000-0000-0000-000000000000' };
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async findMany(
    query: QueryMembersDto,
    principal: AuthenticatedUser,
  ): Promise<PaginatedResult<MemberWithRelations>> {
    const scope = await this.scopeFor(principal);

    const filters: Prisma.MemberWhereInput[] = [scope];

    if (query.status) filters.push({ status: query.status });
    if (query.gender) filters.push({ gender: query.gender });

    // A trainer is always scoped to themselves; an explicit filter must never
    // widen that, so it is only honoured for an administrator.
    if (query.assignedTrainerId && principal.role === UserRole.ADMIN) {
      filters.push({ assignedTrainerId: query.assignedTrainerId });
    }

    if (query.unassigned !== undefined) {
      filters.push({ assignedTrainerId: query.unassigned ? null : { not: null } });
    }

    if (query.search) {
      filters.push(MembersService.searchFilter(query.search));
    }

    const where: Prisma.MemberWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where,
        include: MEMBER_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.member.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  /** Free-text search across name, email and member code. */
  private static searchFilter(search: string): Prisma.MemberWhereInput {
    const insensitive = Prisma.QueryMode.insensitive;
    const or: Prisma.MemberWhereInput[] = [
      { user: { firstName: { contains: search, mode: insensitive } } },
      { user: { lastName: { contains: search, mode: insensitive } } },
      { user: { email: { contains: search, mode: insensitive } } },
    ];

    // "M-000042", "000042" and "42" all find member number 42.
    const digits = search.replace(/^m-?/i, '').replace(/^0+/, '');
    if (digits.length > 0 && /^\d+$/.test(digits)) {
      or.push({ memberNumber: Number.parseInt(digits, 10) });
    }

    return { OR: or };
  }

  /**
   * Reads one member within the caller's scope.
   *
   * A member outside the caller's scope reports 404 rather than 403: a
   * trainer must not be able to discover which member ids exist by probing.
   */
  async findOneScoped(id: string, principal: AuthenticatedUser): Promise<MemberWithRelations> {
    const scope = await this.scopeFor(principal);

    const member = await this.prisma.member.findFirst({
      where: { AND: [{ id }, scope] },
      include: MEMBER_INCLUDE,
    });

    if (!member) throw new NotFoundError('Member', id);
    return member;
  }

  /** Unscoped read, for administrator-only operations. */
  async findOneOrFail(id: string): Promise<MemberWithRelations> {
    const member = await this.prisma.member.findUnique({ where: { id }, include: MEMBER_INCLUDE });
    if (!member) throw new NotFoundError('Member', id);
    return member;
  }

  async findByUserIdOrFail(userId: string): Promise<MemberWithRelations> {
    const member = await this.prisma.member.findUnique({
      where: { userId },
      include: MEMBER_INCLUDE,
    });

    if (!member) {
      throw new NotFoundError('Member profile for the current account');
    }

    return member;
  }

  /** Members assigned to a trainer. Used by the trainers module. */
  async findByTrainer(
    trainerId: string,
    query: QueryMembersDto,
  ): Promise<PaginatedResult<MemberWithRelations>> {
    const filters: Prisma.MemberWhereInput[] = [{ assignedTrainerId: trainerId }];
    if (query.status) filters.push({ status: query.status });
    if (query.search) filters.push(MembersService.searchFilter(query.search));

    const where: Prisma.MemberWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where,
        include: MEMBER_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.member.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async create(dto: CreateMemberDto): Promise<MemberWithRelations> {
    const trainer = dto.assignedTrainerId
      ? await this.requireAssignableTrainer(dto.assignedTrainerId)
      : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await this.accounts.resolve(tx, 'member', dto);

      return tx.member.create({
        data: {
          userId: user.id,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender ?? null,
          address: dto.address ?? null,
          emergencyContactName: dto.emergencyContactName ?? null,
          emergencyContactPhone: dto.emergencyContactPhone ?? null,
          notes: dto.notes ?? null,
          joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : new Date(),
          assignedTrainerId: trainer?.id ?? null,
          assignedAt: trainer ? new Date() : null,
        },
        include: MEMBER_INCLUDE,
      });
    });

    this.logger.log(`Created member ${created.id} for account ${created.user.email}`);
    return created;
  }

  async update(id: string, dto: UpdateMemberDto): Promise<MemberWithRelations> {
    const member = await this.findOneOrFail(id);

    const accountChanges: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) accountChanges.firstName = dto.firstName;
    if (dto.lastName !== undefined) accountChanges.lastName = dto.lastName;
    if (dto.phone !== undefined) accountChanges.phone = dto.phone;

    return this.prisma.member.update({
      where: { id: member.id },
      data: {
        ...(Object.keys(accountChanges).length > 0 ? { user: { update: accountChanges } } : {}),
        ...(dto.dateOfBirth !== undefined ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.emergencyContactName !== undefined
          ? { emergencyContactName: dto.emergencyContactName }
          : {}),
        ...(dto.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: dto.emergencyContactPhone }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: MEMBER_INCLUDE,
    });
  }

  /** Self-service edit: contact details only. */
  async updateOwn(userId: string, dto: UpdateOwnMemberProfileDto): Promise<MemberWithRelations> {
    const member = await this.findByUserIdOrFail(userId);

    return this.prisma.member.update({
      where: { id: member.id },
      data: {
        ...(dto.phone !== undefined ? { user: { update: { phone: dto.phone } } } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.emergencyContactName !== undefined
          ? { emergencyContactName: dto.emergencyContactName }
          : {}),
        ...(dto.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: dto.emergencyContactPhone }
          : {}),
      },
      include: MEMBER_INCLUDE,
    });
  }

  /**
   * Archiving is the gym's "this person left" action. The profile and all its
   * history are kept; the login account is deactivated so they can no longer
   * sign in.
   */
  async archive(id: string): Promise<MemberWithRelations> {
    const member = await this.findOneOrFail(id);

    if (member.status === ProfileStatus.ARCHIVED) {
      throw new ConflictError(`Member '${id}' is already archived`);
    }

    const archived = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: member.userId },
        data: { status: UserStatus.INACTIVE },
      });
      await tx.refreshToken.updateMany({
        where: { userId: member.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return tx.member.update({
        where: { id },
        data: { status: ProfileStatus.ARCHIVED, archivedAt: new Date() },
        include: MEMBER_INCLUDE,
      });
    });

    this.logger.log(`Archived member ${id} and deactivated account ${member.user.email}`);
    return archived;
  }

  async reactivate(id: string): Promise<MemberWithRelations> {
    const member = await this.findOneOrFail(id);

    if (member.status === ProfileStatus.ACTIVE) {
      throw new ConflictError(`Member '${id}' is already active`);
    }

    const reactivated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: member.userId },
        data: { status: UserStatus.ACTIVE },
      });

      return tx.member.update({
        where: { id },
        data: { status: ProfileStatus.ACTIVE, archivedAt: null },
        include: MEMBER_INCLUDE,
      });
    });

    this.logger.log(`Reactivated member ${id} and restored account ${member.user.email}`);
    return reactivated;
  }

  /** Assigns a trainer, or unassigns when `trainerId` is null. */
  async assignTrainer(id: string, trainerId: string | null): Promise<MemberWithRelations> {
    const member = await this.findOneOrFail(id);

    if (trainerId === null) {
      return this.prisma.member.update({
        where: { id: member.id },
        data: { assignedTrainerId: null, assignedAt: null },
        include: MEMBER_INCLUDE,
      });
    }

    const trainer = await this.requireAssignableTrainer(trainerId);

    if (member.status === ProfileStatus.ARCHIVED) {
      throw new BusinessRuleError('Cannot assign a trainer to an archived member');
    }

    const updated = await this.prisma.member.update({
      where: { id: member.id },
      data: { assignedTrainerId: trainer.id, assignedAt: new Date() },
      include: MEMBER_INCLUDE,
    });

    this.logger.log(`Assigned trainer ${trainer.id} to member ${member.id}`);
    return updated;
  }

  /** A trainer must exist and be active before anyone can be assigned to them. */
  private async requireAssignableTrainer(trainerId: string): Promise<Trainer> {
    const trainer = await this.prisma.trainer.findUnique({ where: { id: trainerId } });
    if (!trainer) throw new NotFoundError('Trainer', trainerId);

    if (trainer.status !== ProfileStatus.ACTIVE) {
      throw new BusinessRuleError(`Trainer '${trainerId}' is archived and cannot take on members`, [
        { field: 'trainerId', messages: ['trainer must be active'] },
      ]);
    }

    return trainer;
  }

  /** True when this member is the one assigned to that trainer's profile. */
  static isAssignedTo(member: Member, trainerId: string): boolean {
    return member.assignedTrainerId === trainerId;
  }
}
