import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateMembershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'planId must be a valid UUID' })
  planId!: string;

  @ApiPropertyOptional({ example: '2026-02-01', description: 'ISO date. Defaults to today.' })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be an ISO date such as 2026-02-01' })
  startDate?: string;

  @ApiPropertyOptional({
    example: 39.99,
    description:
      'Overrides the plan price for this sale only — for a negotiated rate. ' +
      'Defaults to the plan price at the moment of purchase.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'purchasePrice must be a number with at most 2 decimal places' },
  )
  @Min(0)
  @Max(999999.99)
  purchasePrice?: number;

  @ApiPropertyOptional({ description: 'Staff-facing notes' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RenewMembershipDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Plan for the new term. Defaults to the plan being renewed.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'planId must be a valid UUID' })
  planId?: string;

  @ApiPropertyOptional({
    example: '2026-03-01',
    description:
      'ISO date. Defaults to the day after the current term ends, or today if ' +
      'it has already lapsed.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be an ISO date such as 2026-03-01' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Overrides the plan price for this renewal only.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'purchasePrice must be a number with at most 2 decimal places' },
  )
  @Min(0)
  @Max(999999.99)
  purchasePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ExtendMembershipDto {
  @ApiProperty({ example: 7, minimum: 1, maximum: 365, description: 'Days to add to the end date' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiPropertyOptional({ example: 'Goodwill for the closed week' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class FreezeMembershipDto {
  @ApiPropertyOptional({ example: 'Travelling until April' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class CancelMembershipDto {
  @ApiPropertyOptional({ example: 'Member relocated' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class QueryMembershipsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'planId must be a valid UUID' })
  planId?: string;

  @ApiPropertyOptional({ enum: MembershipStatus, enumName: 'MembershipStatus' })
  @IsOptional()
  @IsEnum(MembershipStatus, {
    message: 'status must be one of PENDING, ACTIVE, FROZEN, EXPIRED, CANCELLED',
  })
  status?: MembershipStatus;

  @ApiPropertyOptional({
    example: '2026-03-31',
    description: 'Only memberships ending on or before this date — for expiry reminders.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endingBefore must be an ISO date such as 2026-03-31' })
  endingBefore?: string;

  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'Only memberships ending on or after this date.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endingAfter must be an ISO date such as 2026-03-01' })
  endingAfter?: string;
}
