import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT for the Authorization header' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque token used to obtain a new access token' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds' })
  expiresIn!: number;
}

export class LoginResponseDto extends AuthTokensDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Password changed successfully' })
  message!: string;
}

export class ForgotPasswordResponseDto extends MessageResponseDto {
  @ApiPropertyOptional({
    description:
      'The raw reset token. Returned only outside production, where no mail ' +
      'delivery exists yet; email delivery arrives in Phase 9.',
  })
  resetToken?: string;
}
