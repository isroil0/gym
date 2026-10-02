import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsStrongPassword } from '../../auth/dto/password-policy';
import { NormalizeEmail, TrimString } from '../../../common/transformers/normalize';

/**
 * Creating a trainer either provisions a new login account or links an
 * existing TRAINER account that has no profile yet. See CreateMemberDto for
 * the same two-mode contract.
 */
export class CreateTrainerDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Link an existing TRAINER account instead of creating one.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId?: string;

  @ApiPropertyOptional({
    example: 'tina@gym.local',
    description: 'Required unless userId is given',
  })
  @ValidateIf((dto: CreateTrainerDto) => !dto.userId)
  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: 'Required unless userId is given' })
  @ValidateIf((dto: CreateTrainerDto) => !dto.userId)
  @IsStrongPassword('password')
  password?: string;

  @ApiPropertyOptional({ example: 'Tina', description: 'Required unless userId is given' })
  @ValidateIf((dto: CreateTrainerDto) => !dto.userId)
  @TrimString()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Trainer', description: 'Required unless userId is given' })
  @ValidateIf((dto: CreateTrainerDto) => !dto.userId)
  @TrimString()
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+15550101' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(3, 30)
  phone?: string;

  // ---- Profile ----

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

  @ApiPropertyOptional({ example: 'NASM-CPT, Precision Nutrition L1' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(1000)
  certifications?: string;

  @ApiPropertyOptional({ example: '2026-01-15', description: 'Defaults to today' })
  @IsOptional()
  @IsDateString({}, { message: 'hiredAt must be an ISO date such as 2026-01-15' })
  hiredAt?: string;
}
