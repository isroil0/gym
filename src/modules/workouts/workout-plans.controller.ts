import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { Roles, ScopedAccess } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { WorkoutPlansService } from './workout-plans.service';
import {
  CreateWorkoutDayDto,
  CreateWorkoutExerciseDto,
  CreateWorkoutPlanDto,
  QueryWorkoutPlansDto,
  UpdateWorkoutDayDto,
  UpdateWorkoutExerciseDto,
  UpdateWorkoutPlanDto,
  WorkoutPlanResponseDto,
} from './dto/workout-plan.dto';

export class PaginatedWorkoutPlansDto {
  @ApiProperty({ type: [WorkoutPlanResponseDto] }) data!: WorkoutPlanResponseDto[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

/**
 * Workout plans, their days and the exercises within them.
 *
 * Every write resolves the plan's member first and checks it against the
 * caller, so "a trainer may only touch their assigned members" holds for plan
 * content as much as for the plan itself. A member can read their plan but
 * never change it — a plan the member could edit is not their trainer's plan.
 */
@ApiTags(SWAGGER_TAGS.workouts)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'workout-plans' })
export class WorkoutPlansController {
  constructor(private readonly plans: WorkoutPlansService) {}

  // --- Fixed paths before /:id ---

  @Get('me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({ summary: 'Own workout plans' })
  @ApiOkResponse({ type: PaginatedWorkoutPlansDto })
  async findOwn(
    @CurrentUser() principal: AuthenticatedUser,
    @Query() query: QueryWorkoutPlansDto,
  ): Promise<PaginatedWorkoutPlansDto> {
    const result = await this.plans.findMany(query, principal);
    return {
      data: result.data.map((plan) => WorkoutPlanResponseDto.from(plan, false)),
      meta: result.meta,
    };
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Create a workout plan',
    description:
      'A trainer may only write plans for members assigned to them, and is ' +
      "recorded as the plan's author.",
  })
  @ApiCreatedResponse({ type: WorkoutPlanResponseDto })
  @ApiNotFoundResponse({ description: 'No such member within your scope', type: ApiErrorResponse })
  async create(
    @Body() dto: CreateWorkoutPlanDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(await this.plans.create(dto, principal));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'List workout plans',
    description:
      'Counts only; read one plan for the full programme. A trainer sees plans ' +
      'for their assigned members.',
  })
  @ApiOkResponse({ type: PaginatedWorkoutPlansDto })
  async findMany(
    @Query() query: QueryWorkoutPlansDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<PaginatedWorkoutPlansDto> {
    const result = await this.plans.findMany(query, principal);
    return {
      data: result.data.map((plan) => WorkoutPlanResponseDto.from(plan, false)),
      meta: result.meta,
    };
  }

  @ScopedAccess(
    'Scoped in the service: an administrator sees all, a trainer their assigned members, a member only their own.',
  )
  @Get(':id')
  @ApiOperation({
    summary: 'Get a workout plan with its days and exercises',
    description: 'Anything outside your scope reports 404.',
  })
  @ApiOkResponse({ type: WorkoutPlanResponseDto })
  @ApiNotFoundResponse({ description: 'No such plan within your scope', type: ApiErrorResponse })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(await this.plans.findOneScoped(id, principal));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({ summary: 'Update a workout plan' })
  @ApiOkResponse({ type: WorkoutPlanResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkoutPlanDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(await this.plans.update(id, dto, principal));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Archive a workout plan',
    description: "Keeps it in the member's training history. Reversible.",
  })
  @ApiOkResponse({ type: WorkoutPlanResponseDto })
  @ApiConflictResponse({ description: 'Already archived', type: ApiErrorResponse })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(await this.plans.archive(id, principal));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({ summary: 'Put an archived plan back into use' })
  @ApiOkResponse({ type: WorkoutPlanResponseDto })
  @ApiConflictResponse({ description: 'Already active', type: ApiErrorResponse })
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(await this.plans.reactivate(id, principal));
  }

  // --- Days ---

  @Post(':id/days')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Add a training day',
    description: 'dayOrder must be free in the plan.',
  })
  @ApiCreatedResponse({ type: WorkoutPlanResponseDto })
  @ApiConflictResponse({ description: 'That day position is taken', type: ApiErrorResponse })
  async addDay(
    @Param('id', ParseUUIDPipe) planId: string,
    @Body() dto: CreateWorkoutDayDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(await this.plans.addDay(planId, dto, principal));
  }

  @Patch(':id/days/:dayId')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({ summary: 'Update a training day' })
  @ApiOkResponse({ type: WorkoutPlanResponseDto })
  async updateDay(
    @Param('id', ParseUUIDPipe) planId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: UpdateWorkoutDayDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(await this.plans.updateDay(planId, dayId, dto, principal));
  }

  @Delete(':id/days/:dayId')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Remove a training day',
    description: 'Its exercises go with it. Plan content is editable, unlike financial history.',
  })
  @ApiOkResponse({ type: WorkoutPlanResponseDto })
  async removeDay(
    @Param('id', ParseUUIDPipe) planId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(await this.plans.removeDay(planId, dayId, principal));
  }

  // --- Exercises ---

  @Post(':id/days/:dayId/exercises')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Add an exercise to a day',
    description: 'Sets, reps, load, rest and tempo. reps is free text, so "8-12" and "AMRAP" work.',
  })
  @ApiCreatedResponse({ type: WorkoutPlanResponseDto })
  @ApiConflictResponse({ description: 'That position is taken', type: ApiErrorResponse })
  async addExercise(
    @Param('id', ParseUUIDPipe) planId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: CreateWorkoutExerciseDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(await this.plans.addExercise(planId, dayId, dto, principal));
  }

  @Patch(':id/days/:dayId/exercises/:exerciseId')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({ summary: 'Update a prescribed exercise' })
  @ApiOkResponse({ type: WorkoutPlanResponseDto })
  async updateExercise(
    @Param('id', ParseUUIDPipe) planId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Body() dto: UpdateWorkoutExerciseDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(
      await this.plans.updateExercise(planId, dayId, exerciseId, dto, principal),
    );
  }

  @Delete(':id/days/:dayId/exercises/:exerciseId')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({ summary: 'Remove a prescribed exercise' })
  @ApiOkResponse({ type: WorkoutPlanResponseDto })
  async removeExercise(
    @Param('id', ParseUUIDPipe) planId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<WorkoutPlanResponseDto> {
    return WorkoutPlanResponseDto.from(
      await this.plans.removeExercise(planId, dayId, exerciseId, principal),
    );
  }
}
