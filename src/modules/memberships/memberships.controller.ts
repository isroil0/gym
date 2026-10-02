import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { Roles, ScopedAccess } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { MembersService } from '../members/members.service';
import { MembershipsService } from './memberships.service';
import { ApplyDiscountDto } from './dto/discount.dto';
import {
  CancelMembershipDto,
  CreateMembershipDto,
  ExtendMembershipDto,
  FreezeMembershipDto,
  QueryMembershipsDto,
  RenewMembershipDto,
} from './dto/membership.dto';
import { ExpireOverdueResponseDto, MembershipResponseDto } from './dto/membership-response.dto';

export class PaginatedMembershipsDto {
  data!: MembershipResponseDto[];
  meta!: PaginationMeta;
}

export class OwnMembershipsDto {
  @ApiPropertyOptional({
    type: MembershipResponseDto,
    nullable: true,
    description: 'The membership usable right now, or null.',
  })
  current!: MembershipResponseDto | null;

  @ApiProperty({ type: [MembershipResponseDto], description: 'Every membership, newest first.' })
  history!: MembershipResponseDto[];
}

@ApiTags(SWAGGER_TAGS.memberships)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'memberships' })
export class MembershipsController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly members: MembersService,
  ) {}

  // --- Self-service and fixed paths first, so they are never read as an id ---

  @Get('me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({
    summary: 'Own current membership and full history',
    description: 'Staff notes are omitted. `current` is null when nothing is active or frozen.',
  })
  @ApiOkResponse({ type: OwnMembershipsDto })
  async findOwn(@CurrentUser('id') userId: string): Promise<OwnMembershipsDto> {
    const member = await this.members.findByUserIdOrFail(userId);

    const [current, history] = await Promise.all([
      this.memberships.findCurrentForMember(member.id),
      this.memberships.findHistoryForMember(member.id, {
        page: 1,
        limit: 100,
        skip: 0,
        take: 100,
      }),
    ]);

    return {
      current: current ? MembershipResponseDto.from(current, false) : null,
      history: history.data.map((membership) => MembershipResponseDto.from(membership, false)),
    };
  }

  @Post('sync-statuses')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Reconcile stored statuses with the calendar',
    description:
      'Expires memberships past their end date and activates pending ones that ' +
      'have reached their start date. Safe to run repeatedly; intended for a ' +
      'schedule in Phase 9.',
  })
  @ApiOkResponse({ type: ExpireOverdueResponseDto })
  syncStatuses(): Promise<ExpireOverdueResponseDto> {
    return this.memberships.syncOverdue();
  }

  // --- Staff ---

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Sell a membership to a member',
    description:
      'Price and visit allowance are copied from the plan at this moment and ' +
      'never re-read. A member may not hold two memberships covering the same day.',
  })
  @ApiCreatedResponse({ type: MembershipResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'Archived member or plan, or overlapping membership',
    type: ApiErrorResponse,
  })
  async create(@Body() dto: CreateMembershipDto): Promise<MembershipResponseDto> {
    return MembershipResponseDto.from(await this.memberships.create(dto));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'List memberships',
    description:
      'An administrator sees all. A trainer sees only memberships belonging to ' +
      'their assigned members. Use endingBefore to find memberships about to lapse.',
  })
  @ApiOkResponse({ type: PaginatedMembershipsDto })
  async findMany(
    @Query() query: QueryMembershipsDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<PaginatedMembershipsDto> {
    const result = await this.memberships.findMany(query, principal);
    return {
      data: result.data.map((membership) => MembershipResponseDto.from(membership)),
      meta: result.meta,
    };
  }

  @ScopedAccess(
    'Scoped in the service: an administrator sees all, a trainer their assigned members, a member only their own.',
  )
  @Get(':id')
  @ApiOperation({
    summary: 'Get a membership',
    description:
      "Scoped: a trainer may read only their assigned members' memberships, a " +
      'member only their own. Anything else reports 404.',
  })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiNotFoundResponse({
    description: 'No such membership within your scope',
    type: ApiErrorResponse,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<MembershipResponseDto> {
    const membership = await this.memberships.findOneScoped(id, principal);
    return MembershipResponseDto.from(membership, principal.role !== UserRole.MEMBER);
  }

  @Post(':id/discount')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Apply or clear a discount',
    description:
      'A discount reduces what is owed: amountDue = purchasePrice − discount. ' +
      'The purchase price itself is never rewritten, so the original figure stays ' +
      'auditable. Send amount: 0 to remove the discount.',
  })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'Discount exceeds the purchase price',
    type: ApiErrorResponse,
  })
  async applyDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDiscountDto,
  ): Promise<MembershipResponseDto> {
    return MembershipResponseDto.from(
      await this.memberships.applyDiscount(id, dto.amount, dto.reason),
    );
  }

  @Post(':id/renew')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Renew a membership',
    description:
      'Creates a new term chained to this one, by default starting the day ' +
      'after it ends. Priced from the plan as it stands today.',
  })
  @ApiCreatedResponse({ type: MembershipResponseDto })
  @ApiConflictResponse({ description: 'Already renewed', type: ApiErrorResponse })
  async renew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenewMembershipDto,
  ): Promise<MembershipResponseDto> {
    return MembershipResponseDto.from(await this.memberships.renew(id, dto));
  }

  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Add days to a membership',
    description: 'Pushes the end date out. Extending past today revives an expired membership.',
  })
  @ApiOkResponse({ type: MembershipResponseDto })
  async extend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendMembershipDto,
  ): Promise<MembershipResponseDto> {
    return MembershipResponseDto.from(await this.memberships.extend(id, dto));
  }

  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Freeze a membership',
    description:
      'Stops the clock. The end date is pushed out by the frozen duration when ' +
      'it is unfrozen, so no paid-for days are lost.',
  })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiConflictResponse({ description: 'Already frozen', type: ApiErrorResponse })
  async freeze(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FreezeMembershipDto,
  ): Promise<MembershipResponseDto> {
    return MembershipResponseDto.from(await this.memberships.freeze(id, dto));
  }

  @Post(':id/unfreeze')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Unfreeze a membership',
    description: 'Credits back every whole day the membership was paused.',
  })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiConflictResponse({ description: 'Not frozen', type: ApiErrorResponse })
  async unfreeze(@Param('id', ParseUUIDPipe) id: string): Promise<MembershipResponseDto> {
    return MembershipResponseDto.from(await this.memberships.unfreeze(id));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancel a membership', description: 'Terminal — cannot be reversed.' })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiConflictResponse({ description: 'Already cancelled', type: ApiErrorResponse })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelMembershipDto,
  ): Promise<MembershipResponseDto> {
    return MembershipResponseDto.from(await this.memberships.cancel(id, dto));
  }

  @Post(':id/expire')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Expire a membership now',
    description: 'Ends it today rather than waiting for its end date.',
  })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiConflictResponse({ description: 'Already expired', type: ApiErrorResponse })
  async expire(@Param('id', ParseUUIDPipe) id: string): Promise<MembershipResponseDto> {
    return MembershipResponseDto.from(await this.memberships.expire(id));
  }
}
