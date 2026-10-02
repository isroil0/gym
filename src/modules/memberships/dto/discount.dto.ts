import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';

/**
 * A reduction off a membership's purchase price. Lives with memberships
 * because it changes what is *owed*, not what was received.
 */
export class ApplyDiscountDto {
  @ApiProperty({
    example: 10,
    minimum: 0,
    description: 'Amount off the purchase price. Zero removes the discount.',
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @Min(0)
  @Max(99999999.99)
  amount!: number;

  @ApiPropertyOptional({ example: 'Student rate' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
