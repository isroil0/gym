import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { SettlementStatus } from '../billing-math';

export class QueryOutstandingDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 0.01,
    description: 'Only members owing at least this much. Defaults to any debt above nil.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'minimumBalance must be a number with at most 2 decimal places' },
  )
  @Min(0)
  minimumBalance?: number;
}

/** What is owed on one membership. */
export class MembershipBalanceDto {
  @ApiProperty({ format: 'uuid' }) membershipId!: string;
  @ApiProperty({ example: 'Monthly Unlimited' }) planName!: string;
  @ApiProperty({ enum: MembershipStatus, enumName: 'MembershipStatus' })
  membershipStatus!: MembershipStatus;
  @ApiProperty({ type: String, format: 'date' }) startDate!: Date;
  @ApiProperty({ type: String, format: 'date' }) endDate!: Date;

  @ApiProperty({ example: '49.99', description: 'Price before discount' }) grossAmount!: string;
  @ApiProperty({ example: '5.00' }) discountAmount!: string;
  @ApiPropertyOptional({ nullable: true }) discountReason!: string | null;
  @ApiProperty({ example: '44.99', description: 'Gross less discount' }) amountDue!: string;
  @ApiProperty({ example: '20.00', description: 'Gross received' }) amountPaid!: string;
  @ApiProperty({ example: '0.00' }) amountRefunded!: string;
  @ApiProperty({ example: '20.00', description: 'Received less refunded' }) netPaid!: string;
  @ApiProperty({
    example: '24.99',
    description: 'Due less net paid. Negative means the member is in credit.',
  })
  balance!: string;
  @ApiProperty({ example: '24.99', description: 'The debt, never below nil' })
  outstanding!: string;
  @ApiProperty({ example: '0.00', description: 'Overpayment held as credit' }) credit!: string;
  @ApiProperty({ enum: SettlementStatus, enumName: 'SettlementStatus' })
  settlementStatus!: SettlementStatus;
}

/** A member's whole billing position. */
export class MemberBillingDto {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;
  @ApiProperty({ example: 'mia@gym.local' }) email!: string;

  @ApiProperty({ example: '149.97' }) amountDue!: string;
  @ApiProperty({ example: '100.00' }) amountPaid!: string;
  @ApiProperty({ example: '0.00' }) amountRefunded!: string;
  @ApiProperty({ example: '100.00' }) netPaid!: string;
  @ApiProperty({ example: '49.97' }) balance!: string;
  @ApiProperty({ example: '49.97', description: 'Total debt across every membership' })
  outstanding!: string;
  @ApiProperty({ example: '0.00' }) credit!: string;

  @ApiProperty({
    example: '0.00',
    description:
      'Payments not tied to a membership. Counted as revenue but not applied to any debt.',
  })
  unallocatedPayments!: string;

  @ApiProperty({ type: [MembershipBalanceDto] }) memberships!: MembershipBalanceDto[];
}
