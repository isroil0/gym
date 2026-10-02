import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { TrimString } from '../../../common/transformers/normalize';

export class QueryTrainersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProfileStatus, enumName: 'ProfileStatus' })
  @IsOptional()
  @IsEnum(ProfileStatus, { message: 'status must be one of ACTIVE, ARCHIVED' })
  status?: ProfileStatus;

  @ApiPropertyOptional({
    description: 'Case-insensitive match on name, email, code or specialization',
  })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(100)
  search?: string;
}
