import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token issued by /auth/login or /auth/refresh' })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken should not be empty' })
  @MaxLength(256)
  refreshToken!: string;
}
