import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../../common/transformers/normalize';
import { IsStrongPassword } from '../../auth/dto/password-policy';

export class CreateUserDto {
  @ApiProperty({ example: 'trainer@gym.local' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email!: string;

  @IsStrongPassword('password')
  password!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  @IsEnum(UserRole, { message: 'role must be one of ADMIN, TRAINER, MEMBER' })
  role!: UserRole;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  @Length(1, 100)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  @Length(1, 100)
  lastName!: string;

  @ApiPropertyOptional({ example: '+15550100' })
  @IsOptional()
  @IsString()
  @Length(3, 30)
  phone?: string;

  @ApiPropertyOptional({
    enum: UserStatus,
    enumName: 'UserStatus',
    default: UserStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: 'status must be one of ACTIVE, INACTIVE' })
  status?: UserStatus;
}
