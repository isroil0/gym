import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompensationType, type Trainer } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Max, Min, ValidateIf } from 'class-validator';
import { format } from '../../../common/money/money';

const NEEDS_SALARY: CompensationType[] = [
  CompensationType.FIXED,
  CompensationType.FIXED_PLUS_COMMISSION,
];

const NEEDS_COMMISSION: CompensationType[] = [
  CompensationType.COMMISSION,
  CompensationType.FIXED_PLUS_COMMISSION,
];

/**
 * How a trainer is paid.
 *
 * Phase 5 stores this configuration and lets salary payouts be recorded as
 * trainer-attributed expenses. Computing a payroll run from it is deliberately
 * left to a later phase.
 */
export class SetCompensationDto {
  @ApiProperty({ enum: CompensationType, enumName: 'CompensationType' })
  @IsEnum(CompensationType, {
    message: 'compensationType must be one of NONE, FIXED, COMMISSION, FIXED_PLUS_COMMISSION',
  })
  compensationType!: CompensationType;

  @ApiPropertyOptional({
    example: 2500,
    minimum: 0,
    description: 'Required for FIXED and FIXED_PLUS_COMMISSION.',
  })
  @ValidateIf((dto: SetCompensationDto) => NEEDS_SALARY.includes(dto.compensationType))
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'monthlySalary must be a number with at most 2 decimal places' },
  )
  @Min(0)
  @Max(99999999.99)
  monthlySalary?: number;

  @ApiPropertyOptional({
    example: 15,
    minimum: 0,
    maximum: 100,
    description:
      'Percentage of attributed revenue. Required for COMMISSION and FIXED_PLUS_COMMISSION.',
  })
  @ValidateIf((dto: SetCompensationDto) => NEEDS_COMMISSION.includes(dto.compensationType))
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'commissionRate must be a number with at most 2 decimal places' },
  )
  @Min(0)
  @Max(100, { message: 'commissionRate must not exceed 100' })
  commissionRate?: number;
}

export class CompensationResponseDto {
  @ApiProperty({ format: 'uuid' }) trainerId!: string;
  @ApiProperty({ enum: CompensationType, enumName: 'CompensationType' })
  compensationType!: CompensationType;
  @ApiPropertyOptional({ example: '2500.00', nullable: true }) monthlySalary!: string | null;
  @ApiPropertyOptional({ example: '15.00', nullable: true, description: 'Percentage, 0-100' })
  commissionRate!: string | null;

  static from(trainer: Trainer): CompensationResponseDto {
    return {
      trainerId: trainer.id,
      compensationType: trainer.compensationType,
      monthlySalary: trainer.monthlySalary ? format(trainer.monthlySalary) : null,
      commissionRate: trainer.commissionRate ? format(trainer.commissionRate) : null,
    };
  }
}

export { NEEDS_COMMISSION, NEEDS_SALARY };
