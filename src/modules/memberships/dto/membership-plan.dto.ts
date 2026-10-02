import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipPlanStatus, type MembershipPlan } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateMembershipPlanDto {
  @ApiProperty({ example: 'Monthly Unlimited' })
  @TrimString()
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional({ example: 'Unlimited visits for 30 days.' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    example: 30,
    minimum: 1,
    maximum: 3650,
    description: 'Length in days, inclusive of the start day',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays!: number;

  @ApiProperty({ example: 49.99, minimum: 0, description: 'Price in the gym currency' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'price must be a number with at most 2 decimal places' },
  )
  @Min(0)
  @Max(999999.99)
  price!: number;

  @ApiPropertyOptional({
    example: 12,
    minimum: 1,
    nullable: true,
    description: 'Visits included. Omit or send null for unlimited.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  visitLimit?: number | null;

  @ApiPropertyOptional({ example: 10, description: 'Ordering hint for plan lists' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateMembershipPlanDto {
  @ApiPropertyOptional({ example: 'Monthly Unlimited' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 3650 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      'Only affects memberships sold from now on; existing ones keep their purchase price.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'price must be a number with at most 2 decimal places' },
  )
  @Min(0)
  @Max(999999.99)
  price?: number;

  @ApiPropertyOptional({ minimum: 1, nullable: true, description: 'null makes the plan unlimited' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  visitLimit?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class QueryMembershipPlansDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MembershipPlanStatus, enumName: 'MembershipPlanStatus' })
  @IsOptional()
  @IsEnum(MembershipPlanStatus, { message: 'status must be one of ACTIVE, ARCHIVED' })
  status?: MembershipPlanStatus;

  @ApiPropertyOptional({ description: 'Case-insensitive match on plan name' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class MembershipPlanResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Monthly Unlimited' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ example: 30 }) durationDays!: number;

  @ApiProperty({
    example: '49.99',
    description: 'Decimal string, so no precision is lost in JSON.',
  })
  price!: string;

  @ApiPropertyOptional({ example: 12, nullable: true, description: 'null means unlimited' })
  visitLimit!: number | null;

  @ApiProperty({ example: false, description: 'Convenience flag for visitLimit === null' })
  unlimitedVisits!: boolean;

  @ApiProperty({ example: 0 }) displayOrder!: number;
  @ApiProperty({ enum: MembershipPlanStatus, enumName: 'MembershipPlanStatus' })
  status!: MembershipPlanStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;

  static from(plan: MembershipPlan): MembershipPlanResponseDto {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      durationDays: plan.durationDays,
      price: plan.price.toFixed(2),
      visitLimit: plan.visitLimit,
      unlimitedVisits: plan.visitLimit === null,
      displayOrder: plan.displayOrder,
      status: plan.status,
      archivedAt: plan.archivedAt,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }
}
