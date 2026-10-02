import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { SelfEditableContactDto } from '../../../common/dto/account-fields.dto';

/** Administrator edit of a member profile. */
export class UpdateMemberDto extends SelfEditableContactDto {
  @ApiPropertyOptional({ example: 'Mia' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Member' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @ApiPropertyOptional({ example: '1995-04-17' })
  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be an ISO date such as 1995-04-17' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender' })
  @IsOptional()
  @IsEnum(Gender, { message: 'gender must be one of MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY' })
  gender?: Gender;

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
}

/**
 * What a member may change about themselves. Name, notes, trainer assignment
 * and status are intentionally not here.
 */
export class UpdateOwnMemberProfileDto extends SelfEditableContactDto {
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
}
