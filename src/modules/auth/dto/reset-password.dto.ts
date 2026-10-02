import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from './password-policy';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The reset token issued by /auth/forgot-password' })
  @IsString()
  @IsNotEmpty({ message: 'token should not be empty' })
  @MaxLength(256)
  token!: string;

  @IsStrongPassword('newPassword')
  newPassword!: string;
}
