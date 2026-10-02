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
  ApiNoContentResponse,
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
import { MeasurementsService } from './measurements.service';
import { MemberAccessService } from './member-access.service';
import {
  CreateMeasurementDto,
  MeasurementResponseDto,
  MemberProgressDto,
  QueryMeasurementsDto,
  UpdateMeasurementDto,
} from './dto/measurement.dto';

export class PaginatedMeasurementsDto {
  @ApiProperty({ type: [MeasurementResponseDto] }) data!: MeasurementResponseDto[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

/**
 * Body measurements, and the progress derived from them.
 *
 * A member reads their own series but never writes it — a measurement is
 * something a trainer takes, and self-reported figures would make the progress
 * numbers meaningless.
 */
@ApiTags(SWAGGER_TAGS.workouts)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'measurements' })
export class MeasurementsController {
  constructor(
    private readonly measurements: MeasurementsService,
    private readonly access: MemberAccessService,
  ) {}

  // --- Fixed paths before /:id ---

  @Get('me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({ summary: 'Own measurement history' })
  @ApiOkResponse({ type: PaginatedMeasurementsDto })
  async findOwn(
    @CurrentUser() principal: AuthenticatedUser,
    @Query() query: QueryMeasurementsDto,
  ): Promise<PaginatedMeasurementsDto> {
    const result = await this.measurements.findMany(query, principal);
    return {
      data: result.data.map((measurement) => MeasurementResponseDto.from(measurement)),
      meta: result.meta,
    };
  }

  @Get('progress/me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({
    summary: 'Own progress',
    description:
      'Latest figures, BMI where height and weight are both known, and the ' +
      'first-to-latest change for every metric with at least two readings.',
  })
  @ApiOkResponse({ type: MemberProgressDto })
  async ownProgress(
    @CurrentUser() principal: AuthenticatedUser,
    @Query() query: QueryMeasurementsDto,
  ): Promise<MemberProgressDto> {
    const memberId = await this.access.ownMemberId(principal.id);
    return this.measurements.progressFor(memberId, query, principal);
  }

  @Get('progress/members/:memberId')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: "A member's progress",
    description: 'A trainer may only look up a member assigned to them.',
  })
  @ApiOkResponse({ type: MemberProgressDto })
  @ApiNotFoundResponse({ description: 'No such member within your scope', type: ApiErrorResponse })
  progressFor(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Query() query: QueryMeasurementsDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<MemberProgressDto> {
    return this.measurements.progressFor(memberId, query, principal);
  }

  // --- Staff ---

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Record a set of body measurements',
    description:
      'Every field is optional — a trainer rarely measures everything at once. ' +
      'One set per member per date.',
  })
  @ApiCreatedResponse({ type: MeasurementResponseDto })
  @ApiConflictResponse({
    description: 'Measurements already exist for that member and date',
    type: ApiErrorResponse,
  })
  async create(
    @Body() dto: CreateMeasurementDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<MeasurementResponseDto> {
    return MeasurementResponseDto.from(await this.measurements.create(dto, principal));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({ summary: 'List measurements' })
  @ApiOkResponse({ type: PaginatedMeasurementsDto })
  async findMany(
    @Query() query: QueryMeasurementsDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<PaginatedMeasurementsDto> {
    const result = await this.measurements.findMany(query, principal);
    return {
      data: result.data.map((measurement) => MeasurementResponseDto.from(measurement)),
      meta: result.meta,
    };
  }

  @ScopedAccess(
    'Scoped in the service: an administrator sees all, a trainer their assigned members, a member only their own.',
  )
  @Get(':id')
  @ApiOperation({ summary: 'Get one set of measurements' })
  @ApiOkResponse({ type: MeasurementResponseDto })
  @ApiNotFoundResponse({ description: 'Not found within your scope', type: ApiErrorResponse })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<MeasurementResponseDto> {
    return MeasurementResponseDto.from(await this.measurements.findOneScoped(id, principal));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Correct a set of measurements',
    description: 'Fields left out are untouched, so a partial fix cannot blank a reading.',
  })
  @ApiOkResponse({ type: MeasurementResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMeasurementDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<MeasurementResponseDto> {
    return MeasurementResponseDto.from(await this.measurements.update(id, dto, principal));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({ summary: 'Delete a set of measurements' })
  @ApiNoContentResponse({ description: 'Deleted' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<void> {
    await this.measurements.remove(id, principal);
  }
}
