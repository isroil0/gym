import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { GroupedReportPeriodDto, ReportPeriodDto } from './dto/common.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  AttendanceReportDto,
  ExpenseReportDto,
  ExpiredMembershipsReportDto,
  MembershipSalesReportDto,
  ProfitReportDto,
  RenewalsReportDto,
  RevenueReportDto,
  TrainerStatsReportDto,
  UnpaidBalancesReportDto,
} from './dto/report.dto';

/**
 * Business reports.
 *
 * Every period is a range of the gym's **local** dates (`gym.timezone`), and
 * each response echoes the zone it used. Series are dense — quiet days appear
 * with a zero rather than being omitted, because a gap in a chart reads as
 * missing data rather than as no money.
 *
 * Revenue, profit and debt figures delegate to the accounting and billing
 * services rather than recomputing, so a report can never disagree with the
 * ledger it came from.
 */
@ApiTags(SWAGGER_TAGS.reports)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Requires the ADMIN role', type: ApiErrorResponse })
@ApiUnprocessableEntityResponse({ description: 'Invalid period', type: ApiErrorResponse })
@Roles(UserRole.ADMIN)
@Controller({ path: 'reports' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('membership-sales')
  @ApiOperation({
    summary: 'Membership sales',
    description: 'What was sold, on which plans, split between renewals and first-time sales.',
  })
  @ApiOkResponse({ type: MembershipSalesReportDto })
  membershipSales(@Query() query: GroupedReportPeriodDto): Promise<MembershipSalesReportDto> {
    return this.reports.membershipSales(query.from, query.to, query.groupBy);
  }

  @Get('revenue')
  @ApiOperation({
    summary: 'Revenue',
    description: 'Income less refunds, split by payment method.',
  })
  @ApiOkResponse({ type: RevenueReportDto })
  revenue(@Query() query: GroupedReportPeriodDto): Promise<RevenueReportDto> {
    return this.reports.revenue(query.from, query.to, query.groupBy);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'Expenses', description: 'Spending by category, with each share.' })
  @ApiOkResponse({ type: ExpenseReportDto })
  expenses(@Query() query: GroupedReportPeriodDto): Promise<ExpenseReportDto> {
    return this.reports.expenses(query.from, query.to, query.groupBy);
  }

  @Get('profit')
  @ApiOperation({
    summary: 'Profit',
    description: 'Revenue less expenses, with the margin and a per-bucket series.',
  })
  @ApiOkResponse({ type: ProfitReportDto })
  profit(@Query() query: GroupedReportPeriodDto): Promise<ProfitReportDto> {
    return this.reports.profit(query.from, query.to, query.groupBy);
  }

  @Get('attendance')
  @ApiOperation({
    summary: 'Attendance',
    description:
      'Visits and distinct members per bucket, average visit length, the split ' +
      'between manual and QR check-in, and the busiest local hours.',
  })
  @ApiOkResponse({ type: AttendanceReportDto })
  attendance(@Query() query: GroupedReportPeriodDto): Promise<AttendanceReportDto> {
    return this.reports.attendance(query.from, query.to, query.groupBy);
  }

  @Get('renewals')
  @ApiOperation({
    summary: 'Renewals',
    description:
      'Memberships renewed in the period, the gap between terms, plan changes, ' +
      'and the renewal rate against memberships that ended.',
  })
  @ApiOkResponse({ type: RenewalsReportDto })
  renewals(@Query() query: ReportPeriodDto): Promise<RenewalsReportDto> {
    return this.reports.renewals(query.from, query.to);
  }

  @Get('expired-memberships')
  @ApiOperation({
    summary: 'Expired memberships',
    description: 'What lapsed in the period, and who has since come back.',
  })
  @ApiOkResponse({ type: ExpiredMembershipsReportDto })
  expiredMemberships(@Query() query: ReportPeriodDto): Promise<ExpiredMembershipsReportDto> {
    return this.reports.expiredMemberships(query.from, query.to);
  }

  @Get('unpaid-balances')
  @ApiOperation({
    summary: 'Unpaid balances',
    description: 'Who owes money, largest debt first. Balances are derived, never stored.',
  })
  @ApiOkResponse({ type: UnpaidBalancesReportDto })
  unpaidBalances(@Query() query: PaginationQueryDto): Promise<UnpaidBalancesReportDto> {
    return this.reports.unpaidBalances(query.limit);
  }

  @Get('trainer-stats')
  @ApiOperation({
    summary: 'Trainer statistics',
    description:
      'Per trainer: assigned members, sessions scheduled, completed, cancelled ' +
      'and no-shows, completion rate, coached minutes, plans written and ' +
      'attributed cost.',
  })
  @ApiOkResponse({ type: TrainerStatsReportDto })
  trainerStats(@Query() query: ReportPeriodDto): Promise<TrainerStatsReportDto> {
    return this.reports.trainerStats(query.from, query.to);
  }
}
