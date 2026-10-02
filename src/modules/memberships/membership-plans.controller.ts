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
import { Roles, ScopedAccess } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { MembershipPlansService } from './membership-plans.service';
import {
  CreateMembershipPlanDto,
  MembershipPlanResponseDto,
  QueryMembershipPlansDto,
  UpdateMembershipPlanDto,
} from './dto/membership-plan.dto';

export class PaginatedMembershipPlansDto {
  data!: MembershipPlanResponseDto[];
  meta!: PaginationMeta;
}

@ApiTags(SWAGGER_TAGS.memberships)
@ApiBearerAuth('access-token')
@Controller({ path: 'membership-plans' })
export class MembershipPlansController {
  constructor(private readonly plans: MembershipPlansService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a membership plan',
    description:
      'Duration, price and visit allowance are all configurable. Omit visitLimit for unlimited visits.',
  })
  @ApiCreatedResponse({ type: MembershipPlanResponseDto })
  @ApiConflictResponse({ description: 'Plan name already used', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'Requires the ADMIN role', type: ApiErrorResponse })
  async create(@Body() dto: CreateMembershipPlanDto): Promise<MembershipPlanResponseDto> {
    return MembershipPlanResponseDto.from(await this.plans.create(dto));
  }

  @Get()
  @ScopedAccess('Readable by every role; a non-administrator sees only plans currently on sale.')
  @ApiOperation({
    summary: 'List membership plans',
    description:
      'Administrators see every plan including archived ones. Trainers and ' +
      'members see only plans currently on sale.',
  })
  @ApiOkResponse({ type: PaginatedMembershipPlansDto })
  async findMany(
    @Query() query: QueryMembershipPlansDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<PaginatedMembershipPlansDto> {
    const result = await this.plans.findMany(query, principal);
    return {
      data: result.data.map((plan) => MembershipPlanResponseDto.from(plan)),
      meta: result.meta,
    };
  }

  @Get(':id')
  @ScopedAccess('Readable by every role; a non-administrator sees only plans currently on sale.')
  @ApiOperation({ summary: 'Get a membership plan' })
  @ApiOkResponse({ type: MembershipPlanResponseDto })
  @ApiNotFoundResponse({
    description: 'No such plan, or it is not on sale',
    type: ApiErrorResponse,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<MembershipPlanResponseDto> {
    return MembershipPlanResponseDto.from(await this.plans.findOneVisible(id, principal));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update a membership plan',
    description:
      'Affects future sales only. Memberships already sold keep the price and ' +
      'visit allowance captured when they were bought.',
  })
  @ApiOkResponse({ type: MembershipPlanResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipPlanDto,
  ): Promise<MembershipPlanResponseDto> {
    return MembershipPlanResponseDto.from(await this.plans.update(id, dto));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Retire a plan from sale',
    description: 'Memberships already sold on it keep running untouched.',
  })
  @ApiOkResponse({ type: MembershipPlanResponseDto })
  @ApiConflictResponse({ description: 'Already archived', type: ApiErrorResponse })
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<MembershipPlanResponseDto> {
    return MembershipPlanResponseDto.from(await this.plans.archive(id));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Put an archived plan back on sale' })
  @ApiOkResponse({ type: MembershipPlanResponseDto })
  @ApiConflictResponse({ description: 'Already active', type: ApiErrorResponse })
  async reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<MembershipPlanResponseDto> {
    return MembershipPlanResponseDto.from(await this.plans.reactivate(id));
  }
}
