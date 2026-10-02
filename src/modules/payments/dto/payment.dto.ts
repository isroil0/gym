import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentMethod,
  PaymentStatus,
  type Member,
  type MemberMembership,
  type MembershipPlan,
  type Payment,
  type Refund,
  type User,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { format, sum } from '../../../common/money/money';
import { memberCode } from '../../../common/profiles/profile-code';

export class CreatePaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The membership this payment settles. Omit for other member income, which ' +
      'counts towards revenue but offsets no membership debt.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'membershipId must be a valid UUID' })
  membershipId?: string;

  @ApiProperty({ example: 49.99, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @Min(0.01, { message: 'amount must be greater than zero' })
  @Max(99999999.99)
  amount!: number;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod, { message: 'method must be one of CASH, CARD, TRANSFER, OTHER' })
  method!: PaymentMethod;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'When the money changed hands. Defaults to now.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'paidAt must be an ISO date or date-time' })
  paidAt?: string;

  @ApiPropertyOptional({ example: 'AUTH-8821', description: 'Card auth code, transfer reference' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ description: 'Staff-facing notes' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateRefundDto {
  @ApiProperty({ example: 20, minimum: 0.01, description: 'May not exceed the unrefunded balance' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @Min(0.01, { message: 'amount must be greater than zero' })
  @Max(99999999.99)
  amount!: number;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    description: 'How the money went back. Defaults to how it came in.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'method must be one of CASH, CARD, TRANSFER, OTHER' })
  method?: PaymentMethod;

  @ApiProperty({ example: 'Membership cancelled within cooling-off period' })
  @TrimString()
  @IsString()
  @Length(2, 255)
  reason!: string;

  @ApiPropertyOptional({ example: '2026-10-05', description: 'Defaults to now' })
  @IsOptional()
  @IsDateString({}, { message: 'refundedAt must be an ISO date or date-time' })
  refundedAt?: string;
}

export class QueryPaymentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'membershipId must be a valid UUID' })
  membershipId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'method must be one of CASH, CARD, TRANSFER, OTHER' })
  method?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  @IsOptional()
  @IsEnum(PaymentStatus, {
    message: 'status must be one of COMPLETED, PARTIALLY_REFUNDED, REFUNDED',
  })
  status?: PaymentStatus;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date such as 2026-10-01' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date such as 2026-10-31' })
  to?: string;
}

export class RefundResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '20.00' }) amount!: string;
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' }) method!: PaymentMethod;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) refundedAt!: Date;

  static from(refund: Refund): RefundResponseDto {
    return {
      id: refund.id,
      amount: format(refund.amount),
      method: refund.method,
      reason: refund.reason,
      refundedAt: refund.refundedAt,
    };
  }
}

export type PaymentWithRelations = Payment & {
  member?: (Member & { user: User }) | null;
  membership?: (MemberMembership & { plan: MembershipPlan }) | null;
  refunds?: Refund[];
  recordedBy?: User | null;
};

export class PaymentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) memberId!: string;
  @ApiPropertyOptional({ nullable: true }) memberCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) memberName!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true }) membershipId!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Plan the settled membership was sold on' })
  membershipPlanName!: string | null;

  @ApiProperty({ example: '49.99', description: 'Gross amount received' }) amount!: string;
  @ApiProperty({ example: '0.00', description: 'Total returned against this payment' })
  refundedAmount!: string;
  @ApiProperty({ example: '49.99', description: 'Amount less refunds' }) netAmount!: string;
  @ApiProperty({ example: '49.99', description: 'Still available to refund' })
  refundableAmount!: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' }) method!: PaymentMethod;
  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' }) status!: PaymentStatus;

  @ApiProperty({ type: String, format: 'date-time' }) paidAt!: Date;
  @ApiPropertyOptional({ nullable: true }) reference!: string | null;
  @ApiPropertyOptional({ nullable: true, description: "Omitted from a member's own view" })
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true }) recordedBy!: string | null;
  @ApiPropertyOptional({ type: [RefundResponseDto] }) refunds?: RefundResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static from(payment: PaymentWithRelations, includeStaffNotes = true): PaymentResponseDto {
    const refunded = sum((payment.refunds ?? []).map((refund) => refund.amount));
    const net = payment.amount.minus(refunded);

    return {
      id: payment.id,
      memberId: payment.memberId,
      memberCode: payment.member ? memberCode(payment.member.memberNumber) : null,
      memberName: payment.member
        ? `${payment.member.user.firstName} ${payment.member.user.lastName}`
        : null,
      membershipId: payment.membershipId,
      membershipPlanName: payment.membership?.plan.name ?? null,
      amount: format(payment.amount),
      refundedAmount: format(refunded),
      netAmount: format(net),
      refundableAmount: format(net.isNegative() ? 0 : net),
      method: payment.method,
      status: payment.status,
      paidAt: payment.paidAt,
      reference: payment.reference,
      ...(includeStaffNotes ? { notes: payment.notes } : {}),
      recordedBy: payment.recordedBy
        ? `${payment.recordedBy.firstName} ${payment.recordedBy.lastName}`
        : null,
      ...(payment.refunds
        ? { refunds: payment.refunds.map((refund) => RefundResponseDto.from(refund)) }
        : {}),
      createdAt: payment.createdAt,
    };
  }
}
