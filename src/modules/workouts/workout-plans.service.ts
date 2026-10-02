import { Injectable, Logger } from '@nestjs/common';
import { Prisma, UserRole, WorkoutPlanStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberAccessService } from './member-access.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import { toDateOnly } from '../memberships/membership-period';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type {
  CreateWorkoutDayDto,
  CreateWorkoutExerciseDto,
  CreateWorkoutPlanDto,
  QueryWorkoutPlansDto,
  UpdateWorkoutDayDto,
  UpdateWorkoutExerciseDto,
  UpdateWorkoutPlanDto,
  WorkoutPlanWithRelations,
} from './dto/workout-plan.dto';

/** The plan shape used for list reads: counts without the full content. */
const PLAN_SUMMARY_INCLUDE = {
  member: { include: { user: true } },
  trainer: { include: { user: true } },
  days: { include: { exercises: true } },
} satisfies Prisma.WorkoutPlanInclude;

/** Detail reads return the whole programme, ordered as the trainer wrote it. */
const PLAN_DETAIL_INCLUDE = {
  member: { include: { user: true } },
  trainer: { include: { user: true } },
  days: {
    orderBy: { dayOrder: 'asc' },
    include: { exercises: { orderBy: { exerciseOrder: 'asc' } } },
  },
} satisfies Prisma.WorkoutPlanInclude;

@Injectable()
export class WorkoutPlansService {
  private readonly logger = new Logger(WorkoutPlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MemberAccessService,
  ) {}

  // -------------------------------------------------------------------------
  // Plans
  // -------------------------------------------------------------------------

  async create(
    dto: CreateWorkoutPlanDto,
    principal: AuthenticatedUser,
  ): Promise<WorkoutPlanWithRelations> {
    await this.access.assertCanManage(dto.memberId, principal);

    if (dto.startDate && dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BusinessRuleError('endDate must not be earlier than startDate', [
        { field: 'endDate', messages: ['must be on or after startDate'] },
      ]);
    }

    // A plan written by a trainer records them as its author. An administrator
    // writing one leaves it unattributed rather than guessing a trainer.
    const trainerId =
      principal.role === UserRole.TRAINER ? await this.access.ownTrainerId(principal.id) : null;

    const plan = await this.prisma.workoutPlan.create({
      data: {
        memberId: dto.memberId,
        trainerId,
        name: dto.name,
        description: dto.description ?? null,
        goal: dto.goal ?? null,
        startDate: dto.startDate ? toDateOnly(new Date(dto.startDate)) : null,
        endDate: dto.endDate ? toDateOnly(new Date(dto.endDate)) : null,
        trainerNotes: dto.trainerNotes ?? null,
      },
      include: PLAN_DETAIL_INCLUDE,
    });

    this.logger.log(`Created workout plan ${plan.id} for member ${dto.memberId}`);
    return plan;
  }

  async findMany(
    query: QueryWorkoutPlansDto,
    principal: AuthenticatedUser,
  ): Promise<PaginatedResult<WorkoutPlanWithRelations>> {
    const filters: Prisma.WorkoutPlanWhereInput[] = [
      { member: await this.access.readScope(principal) },
    ];

    if (query.memberId) filters.push({ memberId: query.memberId });
    if (query.trainerId) filters.push({ trainerId: query.trainerId });
    if (query.status) filters.push({ status: query.status });
    if (query.search) {
      const insensitive = Prisma.QueryMode.insensitive;
      filters.push({
        OR: [
          { name: { contains: query.search, mode: insensitive } },
          { goal: { contains: query.search, mode: insensitive } },
        ],
      });
    }

    const where: Prisma.WorkoutPlanWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.workoutPlan.findMany({
        where,
        include: PLAN_SUMMARY_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.workoutPlan.count({ where }),
    ]);

    // Days are loaded so the counts can be derived; the controller asks the
    // DTO to leave the full programme out of a list response.
    return paginate(data, total, query.page, query.limit);
  }

  async findOneScoped(id: string, principal: AuthenticatedUser): Promise<WorkoutPlanWithRelations> {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { AND: [{ id }, { member: await this.access.readScope(principal) }] },
      include: PLAN_DETAIL_INCLUDE,
    });

    if (!plan) throw new NotFoundError('Workout plan', id);
    return plan;
  }

  /** Loads a plan the caller is allowed to change, or reports it as absent. */
  private async findManageable(
    id: string,
    principal: AuthenticatedUser,
  ): Promise<WorkoutPlanWithRelations> {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id },
      include: PLAN_DETAIL_INCLUDE,
    });

    if (!plan) throw new NotFoundError('Workout plan', id);

    // Reuses the one member-access rule, so "trainers may only touch their
    // assigned members" holds for plan content too, not just the plan itself.
    await this.access.assertCanManage(plan.memberId, principal);
    return plan;
  }

  async update(
    id: string,
    dto: UpdateWorkoutPlanDto,
    principal: AuthenticatedUser,
  ): Promise<WorkoutPlanWithRelations> {
    const plan = await this.findManageable(id, principal);

    const startDate = dto.startDate ? toDateOnly(new Date(dto.startDate)) : plan.startDate;
    const endDate = dto.endDate ? toDateOnly(new Date(dto.endDate)) : plan.endDate;

    if (startDate && endDate && endDate < startDate) {
      throw new BusinessRuleError('endDate must not be earlier than startDate', [
        { field: 'endDate', messages: ['must be on or after startDate'] },
      ]);
    }

    return this.prisma.workoutPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.goal !== undefined ? { goal: dto.goal } : {}),
        ...(dto.startDate !== undefined ? { startDate } : {}),
        ...(dto.endDate !== undefined ? { endDate } : {}),
        ...(dto.trainerNotes !== undefined ? { trainerNotes: dto.trainerNotes } : {}),
      },
      include: PLAN_DETAIL_INCLUDE,
    });
  }

  async archive(id: string, principal: AuthenticatedUser): Promise<WorkoutPlanWithRelations> {
    const plan = await this.findManageable(id, principal);

    if (plan.status === WorkoutPlanStatus.ARCHIVED) {
      throw new ConflictError(`Workout plan '${id}' is already archived`);
    }

    return this.prisma.workoutPlan.update({
      where: { id },
      data: { status: WorkoutPlanStatus.ARCHIVED, archivedAt: new Date() },
      include: PLAN_DETAIL_INCLUDE,
    });
  }

  async reactivate(id: string, principal: AuthenticatedUser): Promise<WorkoutPlanWithRelations> {
    const plan = await this.findManageable(id, principal);

    if (plan.status === WorkoutPlanStatus.ACTIVE) {
      throw new ConflictError(`Workout plan '${id}' is already active`);
    }

    return this.prisma.workoutPlan.update({
      where: { id },
      data: { status: WorkoutPlanStatus.ACTIVE, archivedAt: null },
      include: PLAN_DETAIL_INCLUDE,
    });
  }

  // -------------------------------------------------------------------------
  // Days
  // -------------------------------------------------------------------------

  async addDay(
    planId: string,
    dto: CreateWorkoutDayDto,
    principal: AuthenticatedUser,
  ): Promise<WorkoutPlanWithRelations> {
    await this.findManageable(planId, principal);

    await this.assertDayOrderFree(planId, dto.dayOrder);

    await this.prisma.workoutDay.create({
      data: { planId, dayOrder: dto.dayOrder, name: dto.name, notes: dto.notes ?? null },
    });

    return this.findDetail(planId);
  }

  async updateDay(
    planId: string,
    dayId: string,
    dto: UpdateWorkoutDayDto,
    principal: AuthenticatedUser,
  ): Promise<WorkoutPlanWithRelations> {
    await this.findManageable(planId, principal);
    const day = await this.requireDay(planId, dayId);

    if (dto.dayOrder !== undefined && dto.dayOrder !== day.dayOrder) {
      await this.assertDayOrderFree(planId, dto.dayOrder);
    }

    await this.prisma.workoutDay.update({
      where: { id: dayId },
      data: {
        ...(dto.dayOrder !== undefined ? { dayOrder: dto.dayOrder } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    return this.findDetail(planId);
  }

  async removeDay(
    planId: string,
    dayId: string,
    principal: AuthenticatedUser,
  ): Promise<WorkoutPlanWithRelations> {
    await this.findManageable(planId, principal);
    await this.requireDay(planId, dayId);

    // Exercises cascade with the day: plan content is editable, unlike the
    // financial and attendance records elsewhere, which are never deleted.
    await this.prisma.workoutDay.delete({ where: { id: dayId } });

    return this.findDetail(planId);
  }

  // -------------------------------------------------------------------------
  // Exercises
  // -------------------------------------------------------------------------

  async addExercise(
    planId: string,
    dayId: string,
    dto: CreateWorkoutExerciseDto,
    principal: AuthenticatedUser,
  ): Promise<WorkoutPlanWithRelations> {
    await this.findManageable(planId, principal);
    await this.requireDay(planId, dayId);
    await this.assertExerciseOrderFree(dayId, dto.exerciseOrder);

    await this.prisma.workoutExercise.create({
      data: {
        dayId,
        exerciseOrder: dto.exerciseOrder,
        name: dto.name,
        targetMuscleGroup: dto.targetMuscleGroup ?? null,
        sets: dto.sets,
        reps: dto.reps,
        weight: dto.weight !== undefined ? new Prisma.Decimal(dto.weight) : null,
        ...(dto.weightUnit !== undefined ? { weightUnit: dto.weightUnit } : {}),
        restSeconds: dto.restSeconds ?? null,
        tempo: dto.tempo ?? null,
        notes: dto.notes ?? null,
      },
    });

    return this.findDetail(planId);
  }

  async updateExercise(
    planId: string,
    dayId: string,
    exerciseId: string,
    dto: UpdateWorkoutExerciseDto,
    principal: AuthenticatedUser,
  ): Promise<WorkoutPlanWithRelations> {
    await this.findManageable(planId, principal);
    await this.requireDay(planId, dayId);
    const exercise = await this.requireExercise(dayId, exerciseId);

    if (dto.exerciseOrder !== undefined && dto.exerciseOrder !== exercise.exerciseOrder) {
      await this.assertExerciseOrderFree(dayId, dto.exerciseOrder);
    }

    await this.prisma.workoutExercise.update({
      where: { id: exerciseId },
      data: {
        ...(dto.exerciseOrder !== undefined ? { exerciseOrder: dto.exerciseOrder } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.targetMuscleGroup !== undefined
          ? { targetMuscleGroup: dto.targetMuscleGroup }
          : {}),
        ...(dto.sets !== undefined ? { sets: dto.sets } : {}),
        ...(dto.reps !== undefined ? { reps: dto.reps } : {}),
        ...(dto.weight !== undefined ? { weight: new Prisma.Decimal(dto.weight) } : {}),
        ...(dto.weightUnit !== undefined ? { weightUnit: dto.weightUnit } : {}),
        ...(dto.restSeconds !== undefined ? { restSeconds: dto.restSeconds } : {}),
        ...(dto.tempo !== undefined ? { tempo: dto.tempo } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    return this.findDetail(planId);
  }

  async removeExercise(
    planId: string,
    dayId: string,
    exerciseId: string,
    principal: AuthenticatedUser,
  ): Promise<WorkoutPlanWithRelations> {
    await this.findManageable(planId, principal);
    await this.requireDay(planId, dayId);
    await this.requireExercise(dayId, exerciseId);

    await this.prisma.workoutExercise.delete({ where: { id: exerciseId } });

    return this.findDetail(planId);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async findDetail(planId: string): Promise<WorkoutPlanWithRelations> {
    return this.prisma.workoutPlan.findUniqueOrThrow({
      where: { id: planId },
      include: PLAN_DETAIL_INCLUDE,
    });
  }

  /** A day must belong to the plan in the path, not merely exist. */
  private async requireDay(planId: string, dayId: string) {
    const day = await this.prisma.workoutDay.findFirst({ where: { id: dayId, planId } });
    if (!day) throw new NotFoundError('Workout day', dayId);
    return day;
  }

  private async requireExercise(dayId: string, exerciseId: string) {
    const exercise = await this.prisma.workoutExercise.findFirst({
      where: { id: exerciseId, dayId },
    });
    if (!exercise) throw new NotFoundError('Workout exercise', exerciseId);
    return exercise;
  }

  private async assertDayOrderFree(planId: string, dayOrder: number): Promise<void> {
    const clash = await this.prisma.workoutDay.findFirst({
      where: { planId, dayOrder },
      select: { id: true, name: true },
    });

    if (clash) {
      throw new ConflictError(`Day ${dayOrder} is already taken by '${clash.name}'`, [
        { field: 'dayOrder', messages: ['must be unique within the plan'] },
      ]);
    }
  }

  private async assertExerciseOrderFree(dayId: string, exerciseOrder: number): Promise<void> {
    const clash = await this.prisma.workoutExercise.findFirst({
      where: { dayId, exerciseOrder },
      select: { id: true, name: true },
    });

    if (clash) {
      throw new ConflictError(`Position ${exerciseOrder} is already taken by '${clash.name}'`, [
        { field: 'exerciseOrder', messages: ['must be unique within the day'] },
      ]);
    }
  }
}
