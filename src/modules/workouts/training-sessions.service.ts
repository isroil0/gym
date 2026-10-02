import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TrainingSessionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberAccessService } from './member-access.service';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import {
  BLOCKING_STATUSES,
  SESSION_WINDOW_MESSAGES,
  isSessionTerminal,
  validateSessionWindow,
} from './session-scheduling';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type {
  CancelTrainingSessionDto,
  CompleteTrainingSessionDto,
  CreateTrainingSessionDto,
  QueryTrainingSessionsDto,
  RescheduleTrainingSessionDto,
  TrainingSessionWithRelations,
} from './dto/training-session.dto';

const SESSION_INCLUDE = {
  member: { include: { user: true } },
  trainer: { include: { user: true } },
} satisfies Prisma.TrainingSessionInclude;

@Injectable()
export class TrainingSessionsService {
  private readonly logger = new Logger(TrainingSessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MemberAccessService,
  ) {}

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async create(
    dto: CreateTrainingSessionDto,
    principal: AuthenticatedUser,
  ): Promise<TrainingSessionWithRelations> {
    await this.access.assertCanManage(dto.memberId, principal);

    const trainerId = await this.resolveTrainerId(dto.trainerId, principal);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    this.assertWindowValid(startsAt, endsAt);
    await this.assertSlotFree(trainerId, dto.memberId, startsAt, endsAt);

    const session = await this.prisma.trainingSession.create({
      data: {
        trainerId,
        memberId: dto.memberId,
        startsAt,
        endsAt,
        location: dto.location ?? null,
        trainerNotes: dto.trainerNotes ?? null,
      },
      include: SESSION_INCLUDE,
    });

    this.logger.log(
      `Booked session ${session.id}: trainer ${trainerId} with member ${dto.memberId} at ${startsAt.toISOString()}`,
    );
    return session;
  }

  /**
   * A trainer always books as themselves — passing someone else's id would let
   * them fill a colleague's diary. Only an administrator chooses the trainer.
   */
  private async resolveTrainerId(
    requested: string | undefined,
    principal: AuthenticatedUser,
  ): Promise<string> {
    if (principal.role === UserRole.TRAINER) {
      const own = await this.access.ownTrainerId(principal.id);
      if (!own) {
        throw new NotFoundError('Trainer profile for the current account');
      }

      if (requested && requested !== own) {
        throw new ForbiddenError('A trainer may only book sessions for themselves');
      }

      return own;
    }

    if (!requested) {
      throw new BusinessRuleError('trainerId is required when an administrator books a session', [
        { field: 'trainerId', messages: ['is required'] },
      ]);
    }

    const trainer = await this.prisma.trainer.findUnique({
      where: { id: requested },
      select: { id: true },
    });
    if (!trainer) throw new NotFoundError('Trainer', requested);

    return requested;
  }

  async reschedule(
    id: string,
    dto: RescheduleTrainingSessionDto,
    principal: AuthenticatedUser,
  ): Promise<TrainingSessionWithRelations> {
    const session = await this.findManageable(id, principal);

    // 409, like completing or cancelling a finished session: all three are the
    // same class of problem — the session's state forbids the change.
    this.assertStillOpen(session.status, 'rescheduled');

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : session.startsAt;

    // Moving only the start keeps the original length: "move it to 2pm" means
    // the same session an hour later, not a session that ends before it begins.
    const endsAt = dto.endsAt
      ? new Date(dto.endsAt)
      : dto.startsAt
        ? new Date(startsAt.getTime() + (session.endsAt.getTime() - session.startsAt.getTime()))
        : session.endsAt;

    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      this.assertWindowValid(startsAt, endsAt);
      await this.assertSlotFree(session.trainerId, session.memberId, startsAt, endsAt, id);
    }

    return this.prisma.trainingSession.update({
      where: { id },
      data: {
        ...(dto.startsAt !== undefined ? { startsAt } : {}),
        // Written whenever either end moved, since the start can shift the end.
        ...(dto.startsAt !== undefined || dto.endsAt !== undefined ? { endsAt } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.trainerNotes !== undefined ? { trainerNotes: dto.trainerNotes } : {}),
      },
      include: SESSION_INCLUDE,
    });
  }

  async complete(
    id: string,
    dto: CompleteTrainingSessionDto,
    principal: AuthenticatedUser,
  ): Promise<TrainingSessionWithRelations> {
    const session = await this.findManageable(id, principal);
    this.assertStillOpen(session.status, 'completed');

    return this.prisma.trainingSession.update({
      where: { id },
      data: {
        status: TrainingSessionStatus.COMPLETED,
        completedAt: new Date(),
        ...(dto.trainerNotes !== undefined ? { trainerNotes: dto.trainerNotes } : {}),
      },
      include: SESSION_INCLUDE,
    });
  }

  async cancel(
    id: string,
    dto: CancelTrainingSessionDto,
    principal: AuthenticatedUser,
  ): Promise<TrainingSessionWithRelations> {
    const session = await this.findManageable(id, principal);
    this.assertStillOpen(session.status, 'cancelled');

    const cancelled = await this.prisma.trainingSession.update({
      where: { id },
      data: {
        status: TrainingSessionStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? null,
      },
      include: SESSION_INCLUDE,
    });

    this.logger.log(`Cancelled session ${id}${dto.reason ? ` (${dto.reason})` : ''}`);
    return cancelled;
  }

  /**
   * The member did not turn up. Distinct from a cancellation because the
   * trainer's time was consumed — which matters for Phase 8's trainer stats.
   */
  async markNoShow(
    id: string,
    principal: AuthenticatedUser,
  ): Promise<TrainingSessionWithRelations> {
    const session = await this.findManageable(id, principal);
    this.assertStillOpen(session.status, 'marked as a no-show');

    return this.prisma.trainingSession.update({
      where: { id },
      data: { status: TrainingSessionStatus.NO_SHOW },
      include: SESSION_INCLUDE,
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async findMany(
    query: QueryTrainingSessionsDto,
    principal: AuthenticatedUser,
  ): Promise<PaginatedResult<TrainingSessionWithRelations>> {
    const filters: Prisma.TrainingSessionWhereInput[] = [
      { member: await this.access.readScope(principal) },
    ];

    if (query.memberId) filters.push({ memberId: query.memberId });
    if (query.trainerId) filters.push({ trainerId: query.trainerId });
    if (query.status) filters.push({ status: query.status });
    if (query.from) filters.push({ startsAt: { gte: new Date(query.from) } });
    if (query.to) filters.push({ startsAt: { lte: TrainingSessionsService.endOfDay(query.to) } });

    const where: Prisma.TrainingSessionWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.trainingSession.findMany({
        where,
        include: SESSION_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ startsAt: 'asc' }],
      }),
      this.prisma.trainingSession.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  /**
   * A trainer's own diary. Unlike `findMany`, this is keyed on the trainer
   * rather than on which members they manage, so a session with a member who
   * has since been reassigned still appears in the schedule they committed to.
   */
  async scheduleForTrainer(
    trainerId: string,
    query: QueryTrainingSessionsDto,
  ): Promise<PaginatedResult<TrainingSessionWithRelations>> {
    const filters: Prisma.TrainingSessionWhereInput[] = [{ trainerId }];

    if (query.status) filters.push({ status: query.status });
    if (query.memberId) filters.push({ memberId: query.memberId });
    if (query.from) filters.push({ startsAt: { gte: new Date(query.from) } });
    if (query.to) filters.push({ startsAt: { lte: TrainingSessionsService.endOfDay(query.to) } });

    const where: Prisma.TrainingSessionWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.trainingSession.findMany({
        where,
        include: SESSION_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ startsAt: 'asc' }],
      }),
      this.prisma.trainingSession.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOneScoped(
    id: string,
    principal: AuthenticatedUser,
  ): Promise<TrainingSessionWithRelations> {
    const session = await this.prisma.trainingSession.findFirst({
      where: { AND: [{ id }, { member: await this.access.readScope(principal) }] },
      include: SESSION_INCLUDE,
    });

    if (!session) throw new NotFoundError('Training session', id);
    return session;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async findManageable(
    id: string,
    principal: AuthenticatedUser,
  ): Promise<TrainingSessionWithRelations> {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });

    if (!session) throw new NotFoundError('Training session', id);

    await this.access.assertCanManage(session.memberId, principal);

    // A trainer may only touch their own diary, even for a member they manage.
    if (principal.role === UserRole.TRAINER) {
      const own = await this.access.ownTrainerId(principal.id);
      if (session.trainerId !== own) {
        throw new NotFoundError('Training session', id);
      }
    }

    return session;
  }

  private assertWindowValid(startsAt: Date, endsAt: Date): void {
    const problem = validateSessionWindow(startsAt, endsAt);

    if (problem) {
      throw new BusinessRuleError(SESSION_WINDOW_MESSAGES[problem], [
        { field: 'endsAt', messages: [SESSION_WINDOW_MESSAGES[problem]] },
      ]);
    }
  }

  private assertStillOpen(status: TrainingSessionStatus, action: string): void {
    if (isSessionTerminal(status)) {
      throw new ConflictError(
        `A session that is ${status.toLowerCase().replace('_', ' ')} cannot be ${action}`,
      );
    }
  }

  /**
   * Neither the trainer nor the member may be in two places at once.
   *
   * Overlap is evaluated in SQL as `startsAt < newEnd AND endsAt > newStart`,
   * the half-open rule — so back-to-back sessions are allowed and only genuine
   * clashes are rejected.
   */
  private async assertSlotFree(
    trainerId: string,
    memberId: string,
    startsAt: Date,
    endsAt: Date,
    excludeSessionId?: string,
  ): Promise<void> {
    const overlapping: Prisma.TrainingSessionWhereInput = {
      status: { in: [...BLOCKING_STATUSES] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
    };

    const [trainerClash, memberClash] = await Promise.all([
      this.prisma.trainingSession.findFirst({
        where: { ...overlapping, trainerId },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.trainingSession.findFirst({
        where: { ...overlapping, memberId },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    if (trainerClash) {
      throw new ConflictError(
        `That trainer already has a session from ${trainerClash.startsAt.toISOString()} to ${trainerClash.endsAt.toISOString()}`,
        [{ field: 'startsAt', messages: ['clashes with another session for this trainer'] }],
      );
    }

    if (memberClash) {
      throw new ConflictError(
        `That member already has a session from ${memberClash.startsAt.toISOString()} to ${memberClash.endsAt.toISOString()}`,
        [{ field: 'startsAt', messages: ['clashes with another session for this member'] }],
      );
    }
  }

  /**
   * A bare date in `to` means "up to the end of that day", so a one-day filter
   * does not silently exclude everything after midnight.
   */
  private static endOfDay(value: string): Date {
    const parsed = new Date(value);
    if (value.length <= 10) {
      return new Date(parsed.getTime() + 86_400_000 - 1);
    }
    return parsed;
  }
}
