import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
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
 * Creating a member either provisions a new login account or links an existing
 * one:
 *
 * - supply `userId` to attach the profile to an account that already exists
 *   (it must have role MEMBER and no profile yet), or
 * - omit `userId` and supply the account fields, and both the account and the
 *   profile are created in a single transaction.
 */
export class CreateMemberDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Link an existing MEMBER account instead of creating one.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId?: string;

  @ApiPropertyOptional({ example: 'mia@gym.local', description: 'Required unless userId is given' })
  @ValidateIf((dto: CreateMemberDto) => !dto.userId)
  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: 'Required unless userId is given' })
  @ValidateIf((dto: CreateMemberDto) => !dto.userId)
  @IsStrongPassword('password')
  password?: string;

  @ApiPropertyOptional({ example: 'Mia', description: 'Required unless userId is given' })
  @ValidateIf((dto: CreateMemberDto) => !dto.userId)
  @TrimString()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Member', description: 'Required unless userId is given' })
  @ValidateIf((dto: CreateMemberDto) => !dto.userId)
  @TrimString()
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+15550100' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(3, 30)
  phone?: string;

  // ---- Profile ----

  @ApiPropertyOptional({ example: '1995-04-17', description: 'ISO date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be an ISO date such as 1995-04-17' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender' })
  @IsOptional()
  @IsEnum(Gender, { message: 'gender must be one of MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY' })
  gender?: Gender;

  @ApiPropertyOptional({ example: '12 Queen Street, Springfield' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 255)
  address?: string;

  @ApiPropertyOptional({ example: 'Jane Member' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 100)
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: '+15550199' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(3, 30)
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ description: 'Staff-facing notes. Never returned to the member.' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Assign a trainer at creation time.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'assignedTrainerId must be a valid UUID' })
  assignedTrainerId?: string;

  @ApiProperty({ required: false, example: '2026-01-15', description: 'Defaults to today' })
  @IsOptional()
  @IsDateString({}, { message: 'joinedAt must be an ISO date such as 2026-01-15' })
  joinedAt?: string;
}
