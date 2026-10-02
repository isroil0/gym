import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, ProfileStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { TrimString } from '../../../common/transformers/normalize';

export class QueryMembersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProfileStatus, enumName: 'ProfileStatus' })
  @IsOptional()
  @IsEnum(ProfileStatus, { message: 'status must be one of ACTIVE, ARCHIVED' })
  status?: ProfileStatus;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender' })
  @IsOptional()
  @IsEnum(Gender, { message: 'gender must be one of MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY' })
  gender?: Gender;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Only members assigned to this trainer. Ignored for trainers, who are always scoped to themselves.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'assignedTrainerId must be a valid UUID' })
  assignedTrainerId?: string;

  @ApiPropertyOptional({
    description: 'true: only members with no trainer; false: only members with one',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'unassigned must be true or false' })
  unassigned?: boolean;

  @ApiPropertyOptional({ description: 'Case-insensitive match on name, email or member code' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(100)
  search?: string;
}
