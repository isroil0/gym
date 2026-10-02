import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardsService } from './dashboards.service';
import { ExpiringWindowDto } from './dto/common.dto';
import { AdminDashboardDto, MemberDashboardDto, TrainerDashboardDto } from './dto/dashboard.dto';

/**
 * The first screen each role sees.
 *
 * One endpoint per role rather than a single role-dispatching one: the three
 * answer different questions, and a typed response per role is worth more to a
 * client than a union it has to narrow.
 *
 * Every figure is bucketed by the gym's local calendar, read from the
 * `gym.timezone` setting, and each response states the zone it used.
 */
@ApiTags(SWAGGER_TAGS.reports)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'dashboard' })
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Administrator dashboard',
    description:
      "Member counts, memberships about to lapse, today's attendance, this " +
      "month's revenue, expenses and profit, unpaid balances, new members and " +
      'active trainers.',
  })
  @ApiOkResponse({ type: AdminDashboardDto })
  admin(@Query() query: ExpiringWindowDto): Promise<AdminDashboardDto> {
    return this.dashboards.admin(query.withinDays);
  }

  @Get('trainer')
  @Roles(UserRole.TRAINER)
  @ApiOperation({
    summary: 'Trainer dashboard',
    description:
      "Assigned members, today's and upcoming sessions, this month's session " +
      'tally, and member activity ordered least-recently-seen first so the ' +
      'members drifting away surface at the top.',
  })
  @ApiOkResponse({ type: TrainerDashboardDto })
  @ApiNotFoundResponse({
    description: 'The account has no trainer profile',
    type: ApiErrorResponse,
  })
  trainer(@CurrentUser('id') userId: string): Promise<TrainerDashboardDto> {
    return this.dashboards.trainer(userId);
  }

  @Get('member')
  @Roles(UserRole.MEMBER)
  @ApiOperation({
    summary: 'Member dashboard',
    description:
      'Membership status, days and visits remaining, assigned trainer, visits ' +
      'this month, next session, current workout plan and anything still owed.',
  })
  @ApiOkResponse({ type: MemberDashboardDto })
  @ApiNotFoundResponse({
    description: 'The account has no member profile',
    type: ApiErrorResponse,
  })
  member(@CurrentUser('id') userId: string): Promise<MemberDashboardDto> {
    return this.dashboards.member(userId);
  }
}
