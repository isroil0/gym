import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from './password-policy';

export class ChangePasswordDto {
  @ApiProperty({ description: 'The password currently in use' })
  @IsString()
  @IsNotEmpty({ message: 'currentPassword should not be empty' })
  @MaxLength(128)
  currentPassword!: string;

  @IsStrongPassword('newPassword')
  newPassword!: string;
}
