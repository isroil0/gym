import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../../common/transformers/normalize';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'member@gym.local' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email!: string;
}
