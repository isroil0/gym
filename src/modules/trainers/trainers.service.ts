import { Injectable, Logger } from '@nestjs/common';
import { CompensationType, Prisma, ProfileStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountProvisioningService } from '../users/account-provisioning.service';
import { ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import type { CreateTrainerDto } from './dto/create-trainer.dto';
import type { UpdateOwnTrainerProfileDto, UpdateTrainerDto } from './dto/update-trainer.dto';
import type { QueryTrainersDto } from './dto/query-trainers.dto';
import type { SetCompensationDto } from './dto/compensation.dto';
import { money } from '../../common/money/money';
import type { TrainerWithRelations } from './dto/trainer-response.dto';

const TRAINER_INCLUDE = {
  user: true,
  _count: { select: { assignedMembers: true } },
} satisfies Prisma.TrainerInclude;

export interface ArchivedTrainer {
  trainer: TrainerWithRelations;
  unassignedMemberCount: number;
}

@Injectable()
export class TrainersService {
  private readonly logger = new Logger(TrainersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountProvisioningService,
  ) {}

  async findMany(query: QueryTrainersDto): Promise<PaginatedResult<TrainerWithRelations>> {
    const filters: Prisma.TrainerWhereInput[] = [];

    if (query.status) filters.push({ status: query.status });
    if (query.search) filters.push(TrainersService.searchFilter(query.search));

    const where: Prisma.TrainerWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.trainer.findMany({
        where,
        include: TRAINER_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.trainer.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  private static searchFilter(search: string): Prisma.TrainerWhereInput {
    const insensitive = Prisma.QueryMode.insensitive;
    const or: Prisma.TrainerWhereInput[] = [
      { user: { firstName: { contains: search, mode: insensitive } } },
      { user: { lastName: { contains: search, mode: insensitive } } },
      { user: { email: { contains: search, mode: insensitive } } },
      { specialization: { contains: search, mode: insensitive } },
    ];

    const digits = search.replace(/^t-?/i, '').replace(/^0+/, '');
    if (digits.length > 0 && /^\d+$/.test(digits)) {
      or.push({ trainerNumber: Number.parseInt(digits, 10) });
    }

    return { OR: or };
  }

  async findOneOrFail(id: string): Promise<TrainerWithRelations> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id },
      include: TRAINER_INCLUDE,
    });

    if (!trainer) throw new NotFoundError('Trainer', id);
    return trainer;
  }

  async findByUserIdOrFail(userId: string): Promise<TrainerWithRelations> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { userId },
      include: TRAINER_INCLUDE,
    });

    if (!trainer) {
      throw new NotFoundError('Trainer profile for the current account');
    }

    return trainer;
  }

  async create(dto: CreateTrainerDto): Promise<TrainerWithRelations> {
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await this.accounts.resolve(tx, 'trainer', dto);

      return tx.trainer.create({
        data: {
          userId: user.id,
          specialization: dto.specialization ?? null,
          bio: dto.bio ?? null,
          certifications: dto.certifications ?? null,
          hiredAt: dto.hiredAt ? new Date(dto.hiredAt) : new Date(),
        },
        include: TRAINER_INCLUDE,
      });
    });

    this.logger.log(`Created trainer ${created.id} for account ${created.user.email}`);
    return created;
  }

  async update(id: string, dto: UpdateTrainerDto): Promise<TrainerWithRelations> {
    const trainer = await this.findOneOrFail(id);

    const accountChanges: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) accountChanges.firstName = dto.firstName;
    if (dto.lastName !== undefined) accountChanges.lastName = dto.lastName;
    if (dto.phone !== undefined) accountChanges.phone = dto.phone;

    return this.prisma.trainer.update({
      where: { id: trainer.id },
      data: {
        ...(Object.keys(accountChanges).length > 0 ? { user: { update: accountChanges } } : {}),
        ...(dto.specialization !== undefined ? { specialization: dto.specialization } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.certifications !== undefined ? { certifications: dto.certifications } : {}),
        ...(dto.hiredAt !== undefined ? { hiredAt: new Date(dto.hiredAt) } : {}),
      },
      include: TRAINER_INCLUDE,
    });
  }

  async updateOwn(userId: string, dto: UpdateOwnTrainerProfileDto): Promise<TrainerWithRelations> {
    const trainer = await this.findByUserIdOrFail(userId);

    return this.prisma.trainer.update({
      where: { id: trainer.id },
      data: {
        ...(dto.phone !== undefined ? { user: { update: { phone: dto.phone } } } : {}),
        ...(dto.specialization !== undefined ? { specialization: dto.specialization } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.certifications !== undefined ? { certifications: dto.certifications } : {}),
      },
      include: TRAINER_INCLUDE,
    });
  }

  /**
   * Archives a trainer who has left.
   *
   * Their members are unassigned in the same transaction — leaving members
   * pointed at someone who no longer works here would quietly corrupt every
   * "my trainer" view downstream. The count is reported back so the
   * administrator knows who needs reassigning.
   */
  /**
   * Sets how a trainer is paid. Fields that do not apply to the chosen type are
   * cleared, so a trainer moved from COMMISSION to FIXED cannot keep a stale
   * commission rate that a later payroll run might pick up.
   */
  async setCompensation(id: string, dto: SetCompensationDto): Promise<TrainerWithRelations> {
    await this.findOneOrFail(id);

    const needsSalary =
      dto.compensationType === CompensationType.FIXED ||
      dto.compensationType === CompensationType.FIXED_PLUS_COMMISSION;
    const needsCommission =
      dto.compensationType === CompensationType.COMMISSION ||
      dto.compensationType === CompensationType.FIXED_PLUS_COMMISSION;

    const updated = await this.prisma.trainer.update({
      where: { id },
      data: {
        compensationType: dto.compensationType,
        monthlySalary:
          needsSalary && dto.monthlySalary !== undefined ? money(dto.monthlySalary) : null,
        commissionRate:
          needsCommission && dto.commissionRate !== undefined ? money(dto.commissionRate) : null,
      },
      include: TRAINER_INCLUDE,
    });

    this.logger.log(`Set compensation for trainer ${id} to ${dto.compensationType}`);
    return updated;
  }

  async archive(id: string): Promise<ArchivedTrainer> {
    const trainer = await this.findOneOrFail(id);

    if (trainer.status === ProfileStatus.ARCHIVED) {
      throw new ConflictError(`Trainer '${id}' is already archived`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.member.updateMany({
        where: { assignedTrainerId: id },
        data: { assignedTrainerId: null, assignedAt: null },
      });

      await tx.user.update({
        where: { id: trainer.userId },
        data: { status: UserStatus.INACTIVE },
      });
      await tx.refreshToken.updateMany({
        where: { userId: trainer.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const archived = await tx.trainer.update({
        where: { id },
        data: { status: ProfileStatus.ARCHIVED, archivedAt: new Date() },
        include: TRAINER_INCLUDE,
      });

      return { trainer: archived, unassignedMemberCount: count };
    });

    this.logger.log(
      `Archived trainer ${id}; unassigned ${result.unassignedMemberCount} member(s) and deactivated ${trainer.user.email}`,
    );
    return result;
  }

  async reactivate(id: string): Promise<TrainerWithRelations> {
    const trainer = await this.findOneOrFail(id);

    if (trainer.status === ProfileStatus.ACTIVE) {
      throw new ConflictError(`Trainer '${id}' is already active`);
    }

    const reactivated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: trainer.userId },
        data: { status: UserStatus.ACTIVE },
      });

      return tx.trainer.update({
        where: { id },
        data: { status: ProfileStatus.ACTIVE, archivedAt: null },
        include: TRAINER_INCLUDE,
      });
    });

    this.logger.log(`Reactivated trainer ${id} and restored account ${trainer.user.email}`);
    return reactivated;
  }
}
