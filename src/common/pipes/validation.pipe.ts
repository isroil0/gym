import { ValidationPipe, type ValidationPipeOptions } from '@nestjs/common';

/**
 * The single ValidationPipe configuration used application-wide.
 * - whitelist + forbidNonWhitelisted: unknown properties are rejected, not ignored
 * - transform: payloads arrive as real DTO instances with coerced primitives
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  stopAtFirstError: false,
  validateCustomDecorators: true,
};

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe(VALIDATION_PIPE_OPTIONS);
}
