import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { TrimString } from '../../../common/transformers/normalize';

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole' })
  @IsOptional()
  @IsEnum(UserRole, { message: 'role must be one of ADMIN, TRAINER, MEMBER' })
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, enumName: 'UserStatus' })
  @IsOptional()
  @IsEnum(UserStatus, { message: 'status must be one of ACTIVE, INACTIVE' })
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Case-insensitive match on email, first name or last name' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(100)
  search?: string;
}
