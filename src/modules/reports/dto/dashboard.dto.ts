import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipStatus, TrainingSessionStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export class ExpiringMembershipDto {
  @ApiProperty({ format: 'uuid' }) membershipId!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;
  @ApiProperty({ example: 'Monthly Unlimited' }) planName!: string;
  @ApiProperty({ type: String, format: 'date' }) endDate!: Date;
  @ApiProperty({ example: 6, description: 'Days left including today' })
  daysRemaining!: number;
}

export class DebtorSummaryDto {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;
  @ApiProperty({ example: '49.97' }) outstanding!: string;
}

export class AdminDashboardDto {
  @ApiProperty({ example: '2026-10-02', description: "The gym's local date" })
  date!: string;
  @ApiProperty({ example: 'Europe/London' }) timeZone!: string;
  @ApiProperty({ example: '2026-10', description: 'The month the financial figures cover' })
  month!: string;

  @ApiProperty({ example: 412, description: 'Members holding an active membership today' })
  activeMembers!: number;
  @ApiProperty({
    example: 58,
    description: 'Members whose most recent membership has lapsed and who hold no live one',
  })
  expiredMembers!: number;
  @ApiProperty({ example: 486, description: 'Member profiles not archived' })
  totalMembers!: number;
  @ApiProperty({ example: 9, description: 'Members with no membership ever' })
  membersWithoutMembership!: number;

  @ApiProperty({
    example: 17,
    description: 'Memberships lapsing within the look-ahead window',
  })
  expiringSoonCount!: number;
  @ApiProperty({ type: [ExpiringMembershipDto], description: 'Soonest first' })
  expiringSoon!: ExpiringMembershipDto[];

  @ApiProperty({ example: 37, description: 'Visits started today' })
  todayCheckIns!: number;
  @ApiProperty({ example: 12, description: 'Members inside right now' })
  currentlyInside!: number;

  @ApiProperty({ example: '8420.00', description: 'Income less refunds, this month' })
  monthlyRevenue!: string;
  @ApiProperty({ example: '5310.00' }) monthlyExpenses!: string;
  @ApiProperty({ example: '3110.00', description: 'revenue − expenses' })
  monthlyProfit!: string;

  @ApiProperty({ example: '1240.50', description: 'Total owed across all members' })
  totalOutstanding!: string;
  @ApiProperty({ example: 23 }) membersInDebt!: number;
  @ApiProperty({ type: [DebtorSummaryDto], description: 'Largest debts first' })
  topDebtors!: DebtorSummaryDto[];

  @ApiProperty({ example: 14, description: 'Members who joined this month' })
  newMembersThisMonth!: number;
  @ApiProperty({ example: 31, description: 'Memberships sold this month' })
  membershipsSoldThisMonth!: number;

  @ApiProperty({ example: 6 }) activeTrainers!: number;
  @ApiProperty({ example: 8, description: 'Personal training sessions scheduled today' })
  sessionsToday!: number;
}

// ---------------------------------------------------------------------------
// Trainer
// ---------------------------------------------------------------------------

export class SessionSummaryDto {
  @ApiProperty({ format: 'uuid' }) sessionId!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;
  @ApiProperty({ enum: TrainingSessionStatus, enumName: 'TrainingSessionStatus' })
  status!: TrainingSessionStatus;
  @ApiPropertyOptional({ nullable: true }) location!: string | null;
}

export class MemberActivityDto {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Null when they have never checked in',
  })
  lastVisitAt!: Date | null;
  @ApiPropertyOptional({
    example: 11,
    nullable: true,
    description: 'Days since the last visit. Null when they have never been in.',
  })
  daysSinceLastVisit!: number | null;
  @ApiProperty({ example: 7, description: 'Visits so far this month' })
  visitsThisMonth!: number;
  @ApiProperty({
    enum: MembershipStatus,
    enumName: 'MembershipStatus',
    nullable: true,
    description: 'Status of the membership that would admit them, if any',
  })
  membershipStatus!: MembershipStatus | null;
  @ApiProperty({
    example: false,
    description: 'True when they have not been in for a fortnight — worth a call',
  })
  needsAttention!: boolean;
}

export class TrainerDashboardDto {
  @ApiProperty({ example: '2026-10-02' }) date!: string;
  @ApiProperty({ example: 'Europe/London' }) timeZone!: string;

  @ApiProperty({ format: 'uuid' }) trainerId!: string;
  @ApiProperty({ example: 'T-000001' }) trainerCode!: string;

  @ApiProperty({ example: 24 }) assignedMembers!: number;
  @ApiProperty({ example: 21, description: 'Of those, holding an active membership' })
  assignedMembersActive!: number;

  @ApiProperty({ type: [SessionSummaryDto], description: "Today's sessions, earliest first" })
  sessionsToday!: SessionSummaryDto[];
  @ApiProperty({ type: [SessionSummaryDto], description: 'The next sessions after today' })
  upcomingSessions!: SessionSummaryDto[];
  @ApiProperty({ example: 38, description: 'Sessions completed this month' })
  sessionsCompletedThisMonth!: number;
  @ApiProperty({ example: 2, description: 'No-shows this month' })
  noShowsThisMonth!: number;

  @ApiProperty({ example: 4, description: 'Workout plans currently in use' })
  activeWorkoutPlans!: number;

  @ApiProperty({
    type: [MemberActivityDto],
    description: 'Assigned members, least recently seen first',
  })
  memberActivity!: MemberActivityDto[];
}

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

export class AssignedTrainerSummaryDto {
  @ApiProperty({ format: 'uuid' }) trainerId!: string;
  @ApiProperty({ example: 'T-000001' }) trainerCode!: string;
  @ApiProperty({ example: 'Tina Trainer' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) specialization!: string | null;
}

export class MemberDashboardDto {
  @ApiProperty({ example: '2026-10-02' }) date!: string;
  @ApiProperty({ example: 'Europe/London' }) timeZone!: string;

  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;

  @ApiPropertyOptional({
    enum: MembershipStatus,
    enumName: 'MembershipStatus',
    nullable: true,
    description: 'Null when the member holds no membership at all',
  })
  membershipStatus!: MembershipStatus | null;
  @ApiPropertyOptional({ nullable: true }) membershipPlanName!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  membershipEndDate!: Date | null;
  @ApiPropertyOptional({
    example: 12,
    nullable: true,
    description: 'Days left including today. Null while the membership is frozen.',
  })
  daysRemaining!: number | null;
  @ApiPropertyOptional({
    example: 9,
    nullable: true,
    description: 'Null when the membership is unlimited',
  })
  visitsRemaining!: number | null;
  @ApiProperty({ example: false }) unlimitedVisits!: boolean;
  @ApiProperty({
    example: true,
    description: 'Whether they could walk in right now',
  })
  canCheckInNow!: boolean;

  @ApiPropertyOptional({ type: AssignedTrainerSummaryDto, nullable: true })
  assignedTrainer!: AssignedTrainerSummaryDto | null;

  @ApiProperty({ example: 7 }) visitsThisMonth!: number;
  @ApiProperty({ example: 63 }) visitsAllTime!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastVisitAt!: Date | null;
  @ApiProperty({ example: false, description: 'True while they are inside' })
  currentlyInside!: boolean;

  @ApiPropertyOptional({ type: SessionSummaryDto, nullable: true })
  nextSession!: SessionSummaryDto | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true }) workoutPlanId!: string | null;
  @ApiPropertyOptional({ nullable: true }) workoutPlanName!: string | null;
  @ApiPropertyOptional({ example: 4, nullable: true }) workoutPlanDays!: number | null;

  @ApiProperty({ example: '0.00', description: 'What they still owe' })
  outstandingBalance!: string;
}
