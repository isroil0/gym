import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CheckInMethod, MembershipStatus, PaymentMethod } from '@prisma/client';
import { ReportPeriodMetaDto, SeriesPointDto } from './common.dto';

class PlanSalesRowDto {
  @ApiProperty({ format: 'uuid' }) planId!: string;
  @ApiProperty({ example: 'Monthly Unlimited' }) planName!: string;
  @ApiProperty({ example: 31, description: 'Memberships sold on this plan' }) sold!: number;
  @ApiProperty({ example: '1549.69', description: 'Sum of the agreed prices' })
  grossValue!: string;
  @ApiProperty({ example: '50.00', description: 'Discounts granted' })
  discounts!: string;
  @ApiProperty({ example: '1499.69', description: 'Gross less discounts — what was owed' })
  netValue!: string;
}

export class MembershipSalesReportDto {
  @ApiProperty({ type: ReportPeriodMetaDto }) period!: ReportPeriodMetaDto;
  @ApiProperty({ example: 31 }) totalSold!: number;
  @ApiProperty({ example: '1549.69' }) grossValue!: string;
  @ApiProperty({ example: '50.00' }) discounts!: string;
  @ApiProperty({ example: '1499.69' }) netValue!: string;
  @ApiProperty({
    example: 7,
    description: 'Of those sold, how many were renewals of an earlier membership',
  })
  renewals!: number;
  @ApiProperty({ example: 24, description: 'Sales to a member buying for the first time' })
  firstTimeSales!: number;
  @ApiProperty({ type: [PlanSalesRowDto], description: 'Best selling first' })
  byPlan!: PlanSalesRowDto[];
  @ApiProperty({ type: [SeriesPointDto], description: 'Count sold per bucket' })
  series!: SeriesPointDto[];
}

class MethodTotalDto {
  @ApiPropertyOptional({ enum: PaymentMethod, enumName: 'PaymentMethod', nullable: true })
  method!: PaymentMethod | null;
  @ApiProperty({ example: '820.00' }) income!: string;
  @ApiProperty({ example: '40.00' }) refunds!: string;
}

export class RevenueReportDto {
  @ApiProperty({ type: ReportPeriodMetaDto }) period!: ReportPeriodMetaDto;
  @ApiProperty({ example: '8460.00', description: 'Money in from members' }) income!: string;
  @ApiProperty({ example: '40.00' }) refunds!: string;
  @ApiProperty({ example: '8420.00', description: 'income − refunds' }) revenue!: string;
  @ApiProperty({ type: [MethodTotalDto] }) byPaymentMethod!: MethodTotalDto[];
  @ApiProperty({ type: [SeriesPointDto] }) series!: SeriesPointDto[];
}

class CategoryTotalDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) expenseCategoryId!: string | null;
  @ApiProperty({ example: 'Rent' }) expenseCategoryName!: string;
  @ApiProperty({ example: '1200.00' }) amount!: string;
  @ApiProperty({ example: 22.6, description: 'Share of total expenses, as a percentage' })
  share!: number;
}

export class ExpenseReportDto {
  @ApiProperty({ type: ReportPeriodMetaDto }) period!: ReportPeriodMetaDto;
  @ApiProperty({ example: '5310.00' }) expenses!: string;
  @ApiProperty({ type: [CategoryTotalDto], description: 'Largest spend first' })
  byCategory!: CategoryTotalDto[];
  @ApiProperty({ type: [SeriesPointDto] }) series!: SeriesPointDto[];
}

class ProfitPointDto {
  @ApiProperty({ example: '2026-10-01' }) bucket!: string;
  @ApiProperty({ example: '420.00' }) revenue!: string;
  @ApiProperty({ example: '180.00' }) expenses!: string;
  @ApiProperty({ example: '240.00' }) profit!: string;
}

export class ProfitReportDto {
  @ApiProperty({ type: ReportPeriodMetaDto }) period!: ReportPeriodMetaDto;
  @ApiProperty({ example: '8420.00' }) revenue!: string;
  @ApiProperty({ example: '5310.00' }) expenses!: string;
  @ApiProperty({ example: '3110.00' }) profit!: string;
  @ApiProperty({
    example: 36.9,
    nullable: true,
    description: 'profit ÷ revenue as a percentage. Null when there was no revenue.',
  })
  marginPercent!: number | null;
  @ApiProperty({ type: [ProfitPointDto] }) series!: ProfitPointDto[];
}

class AttendanceBucketDto {
  @ApiProperty({ example: '2026-10-01' }) bucket!: string;
  @ApiProperty({ example: 37 }) visits!: number;
  @ApiProperty({ example: 31, description: 'Distinct members who came in' })
  uniqueMembers!: number;
}

class BusiestHourDto {
  @ApiProperty({ example: 18, description: 'Hour of the local day, 0-23' }) hour!: number;
  @ApiProperty({ example: 142 }) visits!: number;
}

export class AttendanceReportDto {
  @ApiProperty({ type: ReportPeriodMetaDto }) period!: ReportPeriodMetaDto;
  @ApiProperty({ example: 812 }) totalVisits!: number;
  @ApiProperty({ example: 263, description: 'Distinct members across the period' })
  uniqueMembers!: number;
  @ApiProperty({ example: 26.2, description: 'Mean visits per day over the period' })
  averageVisitsPerDay!: number;
  @ApiProperty({
    example: 64,
    nullable: true,
    description: 'Mean completed visit length in minutes. Null when none were closed.',
  })
  averageDurationMinutes!: number | null;
  @ApiProperty({ example: { MANUAL: 180, QR: 632 }, description: 'Visits by check-in method' })
  byMethod!: Record<CheckInMethod, number>;
  @ApiProperty({ type: [BusiestHourDto], description: 'Local hours, busiest first' })
  busiestHours!: BusiestHourDto[];
  @ApiProperty({ type: [AttendanceBucketDto] }) series!: AttendanceBucketDto[];
}

class RenewalRowDto {
  @ApiProperty({ format: 'uuid' }) membershipId!: string;
  @ApiProperty({ format: 'uuid' }) previousMembershipId!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;
  @ApiProperty({ example: 'Monthly Unlimited' }) planName!: string;
  @ApiProperty({ example: 'Monthly Unlimited' }) previousPlanName!: string;
  @ApiProperty({ type: String, format: 'date' }) startDate!: Date;
  @ApiProperty({ example: '49.99' }) purchasePrice!: string;
  @ApiProperty({
    example: 0,
    description: 'Days between the old term ending and the new one starting. Negative means early.',
  })
  gapDays!: number;
  @ApiProperty({ example: false, description: 'Whether the member changed plan' })
  planChanged!: boolean;
}

export class RenewalsReportDto {
  @ApiProperty({ type: ReportPeriodMetaDto }) period!: ReportPeriodMetaDto;
  @ApiProperty({ example: 7 }) totalRenewals!: number;
  @ApiProperty({ example: '349.93' }) renewalValue!: string;
  @ApiProperty({ example: 2, description: 'Renewals where the member changed plan' })
  planChanges!: number;
  @ApiProperty({
    example: 24,
    description: 'Memberships that ended in the period without being renewed',
  })
  lapsedWithoutRenewal!: number;
  @ApiProperty({
    example: 22.6,
    nullable: true,
    description:
      'Renewals as a percentage of memberships that ended in the period. Null when none ended.',
  })
  renewalRatePercent!: number | null;
  @ApiProperty({ type: [RenewalRowDto] }) renewals!: RenewalRowDto[];
}

class ExpiredMembershipRowDto {
  @ApiProperty({ format: 'uuid' }) membershipId!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;
  @ApiProperty({ example: 'mia@gym.local' }) email!: string;
  @ApiProperty({ example: 'Monthly Unlimited' }) planName!: string;
  @ApiProperty({ type: String, format: 'date' }) endDate!: Date;
  @ApiProperty({ enum: MembershipStatus, enumName: 'MembershipStatus' })
  status!: MembershipStatus;
  @ApiProperty({ example: false, description: 'Whether they have since bought another' })
  renewed!: boolean;
  @ApiProperty({ example: 11, description: 'Days since it ended' }) daysSinceExpiry!: number;
}

export class ExpiredMembershipsReportDto {
  @ApiProperty({ type: ReportPeriodMetaDto }) period!: ReportPeriodMetaDto;
  @ApiProperty({ example: 31 }) totalExpired!: number;
  @ApiProperty({ example: 7, description: 'Of those, members who came back' })
  returned!: number;
  @ApiProperty({ example: 24, description: 'Still gone' }) notReturned!: number;
  @ApiProperty({ type: [ExpiredMembershipRowDto], description: 'Most recent first' })
  expired!: ExpiredMembershipRowDto[];
}

class UnpaidRowDto {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;
  @ApiProperty({ example: 'mia@gym.local' }) email!: string;
  @ApiProperty({ example: '149.97' }) amountDue!: string;
  @ApiProperty({ example: '100.00' }) netPaid!: string;
  @ApiProperty({ example: '49.97' }) outstanding!: string;
}

export class UnpaidBalancesReportDto {
  @ApiProperty({ example: 23 }) membersInDebt!: number;
  @ApiProperty({ example: '1240.50' }) totalOutstanding!: string;
  @ApiProperty({ example: '53.93', description: 'Mean debt among members who owe' })
  averageOutstanding!: string;
  @ApiProperty({ type: [UnpaidRowDto], description: 'Largest debt first' })
  balances!: UnpaidRowDto[];
}

class TrainerStatsRowDto {
  @ApiProperty({ format: 'uuid' }) trainerId!: string;
  @ApiProperty({ example: 'T-000001' }) trainerCode!: string;
  @ApiProperty({ example: 'Tina Trainer' }) trainerName!: string;
  @ApiPropertyOptional({ nullable: true }) specialization!: string | null;
  @ApiProperty({ example: 24, description: 'Members currently assigned' })
  assignedMembers!: number;
  @ApiProperty({ example: 42, description: 'Sessions scheduled in the period' })
  sessionsScheduled!: number;
  @ApiProperty({ example: 38 }) sessionsCompleted!: number;
  @ApiProperty({ example: 2 }) sessionsCancelled!: number;
  @ApiProperty({ example: 2 }) noShows!: number;
  @ApiProperty({
    example: 90.5,
    nullable: true,
    description: 'Completed as a percentage of sessions that were due. Null when none were.',
  })
  completionRatePercent!: number | null;
  @ApiProperty({ example: 2280, description: 'Minutes of completed sessions' })
  coachedMinutes!: number;
  @ApiProperty({ example: 6, description: 'Workout plans written in the period' })
  plansWritten!: number;
  @ApiProperty({
    example: '0.00',
    description: 'Expenses attributed to this trainer in the period — salary and commission',
  })
  attributedCost!: string;
}

export class TrainerStatsReportDto {
  @ApiProperty({ type: ReportPeriodMetaDto }) period!: ReportPeriodMetaDto;
  @ApiProperty({ example: 6 }) trainers!: number;
  @ApiProperty({ type: [TrainerStatsRowDto], description: 'Most sessions completed first' })
  stats!: TrainerStatsRowDto[];
}
