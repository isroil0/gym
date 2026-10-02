import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AccountingEntryType,
  IncomeSource,
  PaymentMethod,
  type AccountingEntry,
  type ExpenseCategory,
  type Trainer,
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
import { format } from '../../../common/money/money';

/**
 * Manual ledger entry. Only INCOME and EXPENSE can be entered by hand —
 * REFUND entries are produced by refunding a payment, never typed in.
 */
export class CreateAccountingEntryDto {
  @ApiProperty({
    enum: [AccountingEntryType.INCOME, AccountingEntryType.EXPENSE],
    description: 'REFUND entries cannot be created directly; refund a payment instead.',
  })
  @IsEnum([AccountingEntryType.INCOME, AccountingEntryType.EXPENSE], {
    message: 'type must be INCOME or EXPENSE',
  })
  type!: AccountingEntryType;

  @ApiProperty({ example: 1200.5, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @Min(0.01, { message: 'amount must be greater than zero' })
  @Max(99999999.99)
  amount!: number;

  @ApiProperty({ example: '2026-10-01', description: 'The date the money moved' })
  @IsDateString({}, { message: 'occurredOn must be an ISO date such as 2026-10-01' })
  occurredOn!: string;

  @ApiProperty({ example: 'October premises rent' })
  @TrimString()
  @IsString()
  @Length(2, 255)
  description!: string;

  /**
   * Whether this field belongs here depends on `type`, so the combination is
   * checked by the service and reported as 422. The DTO only validates the
   * format — keeping "is this a UUID" (400) and "does this field belong on this
   * kind of entry" (422) in consistent layers.
   */
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for an EXPENSE; must be omitted for INCOME.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'expenseCategoryId must be a valid UUID' })
  expenseCategoryId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'method must be one of CASH, CARD, TRANSFER, OTHER' })
  method?: PaymentMethod;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Attributes an expense to a trainer — salary or commission payouts.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'trainerId must be a valid UUID' })
  trainerId?: string;
}

export class VoidAccountingEntryDto {
  @ApiProperty({ example: 'Entered against the wrong category' })
  @TrimString()
  @IsString()
  @Length(2, 255)
  reason!: string;
}

export class QueryAccountingEntriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AccountingEntryType, enumName: 'AccountingEntryType' })
  @IsOptional()
  @IsEnum(AccountingEntryType, { message: 'type must be one of INCOME, EXPENSE, REFUND' })
  type?: AccountingEntryType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'expenseCategoryId must be a valid UUID' })
  expenseCategoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'trainerId must be a valid UUID' })
  trainerId?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date such as 2026-10-01' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date such as 2026-10-31' })
  to?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive match on description' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(255)
  search?: string;
}

export class DateRangeQueryDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsDateString({}, { message: 'from must be an ISO date such as 2026-10-01' })
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsDateString({}, { message: 'to must be an ISO date such as 2026-10-31' })
  to!: string;
}

export class MonthlyQueryDto {
  @ApiProperty({ example: 2026, minimum: 2000, maximum: 2200 })
  @Type(() => Number)
  @Min(2000)
  @Max(2200)
  @IsNumber({}, { message: 'year must be a number' })
  year!: number;
}

export type AccountingEntryWithRelations = AccountingEntry & {
  expenseCategory?: ExpenseCategory | null;
  trainer?: (Trainer & { user: User }) | null;
  recordedBy?: User | null;
};

export class AccountingEntryResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: AccountingEntryType, enumName: 'AccountingEntryType' })
  type!: AccountingEntryType;
  @ApiProperty({ example: '1200.50', description: 'Exact decimal string' }) amount!: string;
  @ApiProperty({ type: String, format: 'date', example: '2026-10-01' }) occurredOn!: Date;
  @ApiProperty({ example: 'October premises rent' }) description!: string;

  @ApiPropertyOptional({ nullable: true }) expenseCategoryId!: string | null;
  @ApiPropertyOptional({ nullable: true }) expenseCategoryName!: string | null;
  @ApiPropertyOptional({ enum: IncomeSource, enumName: 'IncomeSource', nullable: true })
  incomeSource!: IncomeSource | null;
  @ApiPropertyOptional({ enum: PaymentMethod, enumName: 'PaymentMethod', nullable: true })
  method!: PaymentMethod | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true }) paymentId!: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) refundId!: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) trainerId!: string | null;
  @ApiPropertyOptional({ nullable: true }) trainerName!: string | null;

  @ApiProperty({
    example: true,
    description: 'Generated by a payment or refund. Automatic entries cannot be voided.',
  })
  isAutomatic!: boolean;

  @ApiProperty({ example: false }) voided!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  voidedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) voidedReason!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Staff member who recorded it' })
  recordedBy!: string | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static from(entry: AccountingEntryWithRelations): AccountingEntryResponseDto {
    return {
      id: entry.id,
      type: entry.type,
      amount: format(entry.amount),
      occurredOn: entry.occurredOn,
      description: entry.description,
      expenseCategoryId: entry.expenseCategoryId,
      expenseCategoryName: entry.expenseCategory?.name ?? null,
      incomeSource: entry.incomeSource,
      method: entry.method,
      paymentId: entry.paymentId,
      refundId: entry.refundId,
      trainerId: entry.trainerId,
      trainerName: entry.trainer
        ? `${entry.trainer.user.firstName} ${entry.trainer.user.lastName}`
        : null,
      isAutomatic: entry.isAutomatic,
      voided: entry.voidedAt !== null,
      voidedAt: entry.voidedAt,
      voidedReason: entry.voidedReason,
      recordedBy: entry.recordedBy
        ? `${entry.recordedBy.firstName} ${entry.recordedBy.lastName}`
        : null,
      createdAt: entry.createdAt,
    };
  }
}
