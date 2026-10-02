import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { SelfEditableContactDto } from '../../../common/dto/account-fields.dto';

/** What a trainer may change about their own profile. */
export class UpdateOwnTrainerProfileDto {
  @ApiPropertyOptional({ example: '+15550101' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(3, 30)
  phone?: string;

  @ApiPropertyOptional({ example: 'Strength & conditioning' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 120)
  specialization?: string;

  @ApiPropertyOptional({ example: 'Ten years coaching powerlifting.' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ example: 'NASM-CPT' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(1000)
  certifications?: string;
}

/** Administrator edit of a trainer profile. */
export class UpdateTrainerDto extends UpdateOwnTrainerProfileDto {
  @ApiPropertyOptional({ example: 'Tina' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Trainer' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsDateString({}, { message: 'hiredAt must be an ISO date such as 2026-01-15' })
  hiredAt?: string;
}

export { SelfEditableContactDto };
