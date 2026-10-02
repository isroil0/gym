import {
  Body,
  Controller,
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { NotFoundError } from '../../common/errors/app.exception';
import { Roles, ScopedAccess } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { TrainingSessionsService } from './training-sessions.service';
import { MemberAccessService } from './member-access.service';
import {
  CancelTrainingSessionDto,
  CompleteTrainingSessionDto,
  CreateTrainingSessionDto,
  QueryTrainingSessionsDto,
  RescheduleTrainingSessionDto,
  TrainingSessionResponseDto,
} from './dto/training-session.dto';

export class PaginatedTrainingSessionsDto {
  @ApiProperty({ type: [TrainingSessionResponseDto] }) data!: TrainingSessionResponseDto[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

/**
 * Personal training sessions, and the trainer schedule built from them.
 *
 * Neither a trainer nor a member can be booked twice over the same minutes.
 * Back-to-back sessions are fine — only genuine overlap is rejected.
 */
@ApiTags(SWAGGER_TAGS.workouts)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'training-sessions' })
export class TrainingSessionsController {
  constructor(
    private readonly sessions: TrainingSessionsService,
    private readonly access: MemberAccessService,
  ) {}

  // --- Fixed paths before /:id ---

  @Get('me')
  @ScopedAccess('Role-dependent: a trainer gets their own diary, a member their own sessions.')
  @ApiOperation({
    summary: 'Own sessions',
    description:
      'For a member, the sessions booked with them. For a trainer, their own ' +
      'diary — including sessions with members since reassigned, because the ' +
      'trainer still committed to that time.',
  })
  @ApiOkResponse({ type: PaginatedTrainingSessionsDto })
  async findOwn(
    @CurrentUser() principal: AuthenticatedUser,
    @Query() query: QueryTrainingSessionsDto,
  ): Promise<PaginatedTrainingSessionsDto> {
    if (principal.role === UserRole.TRAINER) {
      const trainerId = await this.access.ownTrainerId(principal.id);
      if (!trainerId) throw new NotFoundError('Trainer profile for the current account');

      const schedule = await this.sessions.scheduleForTrainer(trainerId, query);
      return {
        data: schedule.data.map((session) => TrainingSessionResponseDto.from(session)),
        meta: schedule.meta,
      };
    }

    const result = await this.sessions.findMany(query, principal);
    return {
      data: result.data.map((session) => TrainingSessionResponseDto.from(session)),
      meta: result.meta,
    };
  }

  @Get('schedule/trainers/:trainerId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: "A trainer's schedule",
    description: 'Keyed on the trainer, so it is their diary rather than their member list.',
  })
  @ApiOkResponse({ type: PaginatedTrainingSessionsDto })
  async scheduleFor(
    @Param('trainerId', ParseUUIDPipe) trainerId: string,
    @Query() query: QueryTrainingSessionsDto,
  ): Promise<PaginatedTrainingSessionsDto> {
    const result = await this.sessions.scheduleForTrainer(trainerId, query);
    return {
      data: result.data.map((session) => TrainingSessionResponseDto.from(session)),
      meta: result.meta,
    };
  }

  // --- Staff ---

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Book a session',
    description:
      'A trainer books as themselves and only for members assigned to them. An ' +
      'administrator must name the trainer.',
  })
  @ApiCreatedResponse({ type: TrainingSessionResponseDto })
  @ApiConflictResponse({ description: 'The slot clashes', type: ApiErrorResponse })
  @ApiUnprocessableEntityResponse({ description: 'Invalid session window', type: ApiErrorResponse })
  async create(
    @Body() dto: CreateTrainingSessionDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<TrainingSessionResponseDto> {
    return TrainingSessionResponseDto.from(await this.sessions.create(dto, principal));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'List sessions',
    description: 'A trainer sees sessions for their assigned members.',
  })
  @ApiOkResponse({ type: PaginatedTrainingSessionsDto })
  async findMany(
    @Query() query: QueryTrainingSessionsDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<PaginatedTrainingSessionsDto> {
    const result = await this.sessions.findMany(query, principal);
    return {
      data: result.data.map((session) => TrainingSessionResponseDto.from(session)),
      meta: result.meta,
    };
  }

  @ScopedAccess(
    'Scoped in the service: an administrator sees all, a trainer their assigned members, a member only their own.',
  )
  @Get(':id')
  @ApiOperation({ summary: 'Get a session' })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  @ApiNotFoundResponse({ description: 'Not found within your scope', type: ApiErrorResponse })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<TrainingSessionResponseDto> {
    return TrainingSessionResponseDto.from(await this.sessions.findOneScoped(id, principal));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({ summary: 'Reschedule or re-note a session' })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  @ApiConflictResponse({ description: 'The new slot clashes', type: ApiErrorResponse })
  async reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleTrainingSessionDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<TrainingSessionResponseDto> {
    return TrainingSessionResponseDto.from(await this.sessions.reschedule(id, dto, principal));
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Mark a session as done',
    description: 'Optionally record what happened.',
  })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  @ApiConflictResponse({ description: 'Already finished', type: ApiErrorResponse })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTrainingSessionDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<TrainingSessionResponseDto> {
    return TrainingSessionResponseDto.from(await this.sessions.complete(id, dto, principal));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({ summary: 'Cancel a session', description: 'Frees the slot for rebooking.' })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  @ApiConflictResponse({ description: 'Already finished', type: ApiErrorResponse })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTrainingSessionDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<TrainingSessionResponseDto> {
    return TrainingSessionResponseDto.from(await this.sessions.cancel(id, dto, principal));
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Record that the member did not turn up',
    description: "Distinct from a cancellation: the trainer's time was still consumed.",
  })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  @ApiConflictResponse({ description: 'Already finished', type: ApiErrorResponse })
  async noShow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<TrainingSessionResponseDto> {
    return TrainingSessionResponseDto.from(await this.sessions.markNoShow(id, principal));
  }
}
