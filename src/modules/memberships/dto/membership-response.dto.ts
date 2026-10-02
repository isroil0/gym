import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MembershipStatus,
  type Member,
  type MemberMembership,
  type MembershipFreeze,
  type MembershipPlan,
  type User,
} from '@prisma/client';
import { memberCode } from '../../../common/profiles/profile-code';
import { daysRemaining, durationInDays, visitsRemaining } from '../membership-period';
import { atLeastZero, format } from '../../../common/money/money';

/** The member a membership belongs to, as referenced from the membership. */
export class MembershipMemberDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia' }) firstName!: string;
  @ApiProperty({ example: 'Member' }) lastName!: string;
  @ApiProperty({ example: 'mia@gym.local' }) email!: string;

  static from(member: Member & { user: User }): MembershipMemberDto {
    return {
      id: member.id,
      memberCode: memberCode(member.memberNumber),
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      email: member.user.email,
    };
  }
}

/** The plan a membership was sold on. Its current price may differ. */
export class MembershipPlanSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Monthly Unlimited' }) name!: string;
  @ApiProperty({ example: 30 }) durationDays!: number;
  @ApiProperty({
    example: '49.99',
    description: 'The plan price *now* — compare with purchasePrice on the membership.',
  })
  currentPrice!: string;

  static from(plan: MembershipPlan): MembershipPlanSummaryDto {
    return {
      id: plan.id,
      name: plan.name,
      durationDays: plan.durationDays,
      currentPrice: plan.price.toFixed(2),
    };
  }
}

export class MembershipFreezeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  endedAt!: Date | null;
  @ApiPropertyOptional({ example: 14, nullable: true, description: 'Days credited back' })
  days!: number | null;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;

  static from(freeze: MembershipFreeze): MembershipFreezeDto {
    return {
      id: freeze.id,
      startedAt: freeze.startedAt,
      endedAt: freeze.endedAt,
      days: freeze.days,
      reason: freeze.reason,
    };
  }
}

export type MembershipWithRelations = MemberMembership & {
  member?: (Member & { user: User }) | null;
  plan: MembershipPlan;
  freezes?: MembershipFreeze[];
};

export class MembershipResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ type: MembershipMemberDto })
  member?: MembershipMemberDto;
  @ApiProperty({ type: MembershipPlanSummaryDto }) plan!: MembershipPlanSummaryDto;

  @ApiProperty({ enum: MembershipStatus, enumName: 'MembershipStatus' })
  status!: MembershipStatus;

  @ApiProperty({
    example: '39.99',
    description: 'The agreed price, captured at purchase. Unaffected by later plan price changes.',
  })
  purchasePrice!: string;

  @ApiProperty({ example: '5.00', description: 'Reduction granted off the purchase price' })
  discountAmount!: string;

  @ApiPropertyOptional({ nullable: true }) discountReason!: string | null;

  @ApiProperty({
    example: '34.99',
    description: 'purchasePrice − discountAmount. What the member actually owes.',
  })
  amountDue!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-02-01' }) startDate!: Date;
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-03-02',
    description: 'Inclusive last day, after any freezes and extensions.',
  })
  endDate!: Date;

  @ApiProperty({ example: 30, description: 'Current length in days, including added days' })
  totalDays!: number;

  @ApiPropertyOptional({
    example: 12,
    nullable: true,
    description: 'Days left including today. null while frozen, where the clock is stopped.',
  })
  daysRemaining!: number | null;

  @ApiPropertyOptional({ example: 12, nullable: true, description: 'null means unlimited' })
  visitLimit!: number | null;
  @ApiProperty({ example: 3 }) visitsUsed!: number;
  @ApiPropertyOptional({ example: 9, nullable: true, description: 'null means unlimited' })
  visitsRemaining!: number | null;
  @ApiProperty({ example: false }) unlimitedVisits!: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  frozenAt!: Date | null;
  @ApiProperty({ example: 0, description: 'Total days this membership has spent frozen' })
  totalFrozenDays!: number;
  @ApiProperty({ example: 0, description: 'Days added by administrator extensions' })
  extendedDays!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) cancellationReason!: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'The membership this one renewed.',
  })
  previousMembershipId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Staff-facing notes. Omitted from a member's own view.",
  })
  notes?: string | null;

  @ApiPropertyOptional({ type: [MembershipFreezeDto], description: 'Freeze history, when loaded' })
  freezes?: MembershipFreezeDto[];

  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;

  /**
   * @param includeStaffNotes false when the member themselves is the reader.
   * @param now injectable so the derived day counts are deterministic in tests.
   */
  static from(
    membership: MembershipWithRelations,
    includeStaffNotes = true,
    now: Date = new Date(),
  ): MembershipResponseDto {
    return {
      id: membership.id,
      ...(membership.member ? { member: MembershipMemberDto.from(membership.member) } : {}),
      plan: MembershipPlanSummaryDto.from(membership.plan),
      status: membership.status,
      purchasePrice: format(membership.purchasePrice),
      discountAmount: format(membership.discountAmount),
      discountReason: membership.discountReason,
      amountDue: format(atLeastZero(membership.purchasePrice.minus(membership.discountAmount))),
      startDate: membership.startDate,
      endDate: membership.endDate,
      totalDays: durationInDays(membership.startDate, membership.endDate),
      daysRemaining: daysRemaining(membership, now),
      visitLimit: membership.visitLimit,
      visitsUsed: membership.visitsUsed,
      visitsRemaining: visitsRemaining(membership.visitLimit, membership.visitsUsed),
      unlimitedVisits: membership.visitLimit === null,
      frozenAt: membership.frozenAt,
      totalFrozenDays: membership.totalFrozenDays,
      extendedDays: membership.extendedDays,
      cancelledAt: membership.cancelledAt,
      cancellationReason: membership.cancellationReason,
      previousMembershipId: membership.previousMembershipId,
      ...(includeStaffNotes ? { notes: membership.notes } : {}),
      ...(membership.freezes
        ? { freezes: membership.freezes.map((freeze) => MembershipFreezeDto.from(freeze)) }
        : {}),
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    };
  }
}

export class ExpireOverdueResponseDto {
  @ApiProperty({ example: 4, description: 'Memberships moved to EXPIRED' })
  expired!: number;

  @ApiProperty({ example: 2, description: 'Memberships moved from PENDING to ACTIVE' })
  activated!: number;
}
