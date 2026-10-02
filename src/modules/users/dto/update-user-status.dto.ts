import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: UserStatus,
    enumName: 'UserStatus',
    description:
      'INACTIVE blocks login and rejects every request made with an already-issued token.',
  })
  @IsEnum(UserStatus, { message: 'status must be one of ACTIVE, INACTIVE' })
  status!: UserStatus;
}
