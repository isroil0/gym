import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { BillingService } from './billing.service';
import { MemberBillingDto, QueryOutstandingDto } from './dto/billing.dto';

export class PaginatedBillingDto {
  @ApiProperty({ type: [MemberBillingDto] }) data!: MemberBillingDto[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

/**
 * What members owe. Every figure here is derived from the memberships and the
 * payments against them, never stored, so it cannot drift.
 */
@ApiTags(SWAGGER_TAGS.payments)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'billing' })
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({
    summary: 'Own balance and per-membership breakdown',
  })
  @ApiOkResponse({ type: MemberBillingDto })
  findOwn(@CurrentUser('id') userId: string): Promise<MemberBillingDto> {
    return this.billing.forUser(userId);
  }

  @Get('outstanding')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Members who still owe money',
    description: 'Ordered by the largest debt first. This is the unpaid-balances report.',
  })
  @ApiOkResponse({ type: PaginatedBillingDto })
  async outstanding(@Query() query: QueryOutstandingDto): Promise<PaginatedBillingDto> {
    const result = await this.billing.outstanding(query);
    return { data: result.data, meta: result.meta };
  }

  @Get('members/:memberId')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: "A member's balance and per-membership breakdown",
    description: 'A trainer may only look up a member assigned to them.',
  })
  @ApiOkResponse({ type: MemberBillingDto })
  forMember(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<MemberBillingDto> {
    return this.billing.forMember(memberId, principal);
  }
}
