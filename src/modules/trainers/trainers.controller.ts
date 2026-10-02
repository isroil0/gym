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
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MembersService } from '../members/members.service';
import { MemberResponseDto } from '../members/dto/member-response.dto';
import { QueryMembersDto } from '../members/dto/query-members.dto';
import { TrainersService } from './trainers.service';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateOwnTrainerProfileDto, UpdateTrainerDto } from './dto/update-trainer.dto';
import { QueryTrainersDto } from './dto/query-trainers.dto';
import { ArchiveTrainerResponseDto, TrainerResponseDto } from './dto/trainer-response.dto';
import { CompensationResponseDto, SetCompensationDto } from './dto/compensation.dto';

export class PaginatedTrainersDto {
  data!: TrainerResponseDto[];
  meta!: PaginationMeta;
}

export class PaginatedMemberSummaryDto {
  data!: MemberResponseDto[];
  meta!: PaginationMeta;
}

@ApiTags(SWAGGER_TAGS.trainers)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'trainers' })
export class TrainersController {
  constructor(
    private readonly trainers: TrainersService,
    private readonly members: MembersService,
  ) {}

  // --- Self-service. Declared before /:id so "me" is never read as an id. ---

  @Get('me')
  @Roles(UserRole.TRAINER)
  @ApiOperation({ summary: 'Own trainer profile' })
  @ApiOkResponse({ type: TrainerResponseDto })
  async findOwn(@CurrentUser('id') userId: string): Promise<TrainerResponseDto> {
    return TrainerResponseDto.from(await this.trainers.findByUserIdOrFail(userId));
  }

  @Patch('me')
  @Roles(UserRole.TRAINER)
  @ApiOperation({
    summary: 'Update own trainer profile',
    description: 'Specialization, bio, certifications and phone. Not name, hire date or status.',
  })
  @ApiOkResponse({ type: TrainerResponseDto })
  async updateOwn(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateOwnTrainerProfileDto,
  ): Promise<TrainerResponseDto> {
    return TrainerResponseDto.from(await this.trainers.updateOwn(userId, dto));
  }

  @Get('me/members')
  @Roles(UserRole.TRAINER)
  @ApiOperation({ summary: 'Members assigned to the signed-in trainer' })
  @ApiOkResponse({ type: PaginatedMemberSummaryDto })
  async findOwnMembers(
    @CurrentUser('id') userId: string,
    @Query() query: QueryMembersDto,
  ): Promise<PaginatedMemberSummaryDto> {
    const trainer = await this.trainers.findByUserIdOrFail(userId);
    const result = await this.members.findByTrainer(trainer.id, query);
    return { data: result.data.map((member) => MemberResponseDto.from(member)), meta: result.meta };
  }

  // --- Staff ---

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a trainer',
    description:
      'Creates the login account and the profile in one transaction, or links ' +
      'an existing TRAINER account when userId is supplied.',
  })
  @ApiCreatedResponse({ type: TrainerResponseDto })
  @ApiConflictResponse({
    description: 'Email taken, or account already linked',
    type: ApiErrorResponse,
  })
  async create(@Body() dto: CreateTrainerDto): Promise<TrainerResponseDto> {
    return TrainerResponseDto.from(await this.trainers.create(dto));
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List trainers' })
  @ApiOkResponse({ type: PaginatedTrainersDto })
  async findMany(@Query() query: QueryTrainersDto): Promise<PaginatedTrainersDto> {
    const result = await this.trainers.findMany(query);
    return {
      data: result.data.map((trainer) => TrainerResponseDto.from(trainer)),
      meta: result.meta,
    };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a trainer' })
  @ApiOkResponse({ type: TrainerResponseDto })
  @ApiNotFoundResponse({ description: 'No such trainer', type: ApiErrorResponse })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TrainerResponseDto> {
    return TrainerResponseDto.from(await this.trainers.findOneOrFail(id));
  }

  @Get(':id/members')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Members assigned to a trainer' })
  @ApiOkResponse({ type: PaginatedMemberSummaryDto })
  async findMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryMembersDto,
  ): Promise<PaginatedMemberSummaryDto> {
    await this.trainers.findOneOrFail(id);
    const result = await this.members.findByTrainer(id, query);
    return { data: result.data.map((member) => MemberResponseDto.from(member)), meta: result.meta };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a trainer profile' })
  @ApiOkResponse({ type: TrainerResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrainerDto,
  ): Promise<TrainerResponseDto> {
    return TrainerResponseDto.from(await this.trainers.update(id, dto));
  }

  @Patch(':id/compensation')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Set how a trainer is paid',
    description:
      'Stores the salary and commission configuration. Payouts are recorded as ' +
      'trainer-attributed expenses through /accounting/entries; computing a ' +
      'payroll run from this configuration is left to a later phase.',
  })
  @ApiOkResponse({ type: CompensationResponseDto })
  async setCompensation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCompensationDto,
  ): Promise<CompensationResponseDto> {
    return CompensationResponseDto.from(await this.trainers.setCompensation(id, dto));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Archive a trainer',
    description:
      'Unassigns their members, deactivates the login account and revokes its ' +
      'sessions. The response reports how many members now need reassigning.',
  })
  @ApiOkResponse({ type: ArchiveTrainerResponseDto })
  @ApiConflictResponse({ description: 'Already archived', type: ApiErrorResponse })
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<ArchiveTrainerResponseDto> {
    const { trainer, unassignedMemberCount } = await this.trainers.archive(id);
    return { ...TrainerResponseDto.from(trainer), unassignedMemberCount };
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Reactivate an archived trainer',
    description: 'Restores the profile and account. Members are not reassigned automatically.',
  })
  @ApiOkResponse({ type: TrainerResponseDto })
  @ApiConflictResponse({ description: 'Already active', type: ApiErrorResponse })
  async reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<TrainerResponseDto> {
    return TrainerResponseDto.from(await this.trainers.reactivate(id));
  }
}
