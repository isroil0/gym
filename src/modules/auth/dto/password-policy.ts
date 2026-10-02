import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** At least one letter and one digit. */
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export const PASSWORD_RULE_DESCRIPTION = `At least ${PASSWORD_MIN_LENGTH} characters, including at least one letter and one number.`;

/**
 * The single password policy. Applied to every endpoint that accepts a new
 * password so the rules can never drift between signup, change and reset.
 */
export function IsStrongPassword(propertyName = 'password') {
  return applyDecorators(
    ApiProperty({
      example: 'StrongPass123',
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
      description: PASSWORD_RULE_DESCRIPTION,
    }),
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, {
      message: `${propertyName} must be at least ${PASSWORD_MIN_LENGTH} characters long`,
    }),
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: `${propertyName} must not exceed ${PASSWORD_MAX_LENGTH} characters`,
    }),
    Matches(PASSWORD_PATTERN, {
      message: `${propertyName} must contain at least one letter and one number`,
    }),
  );
}
