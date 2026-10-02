import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A single field-level validation problem. */
export class ApiErrorDetail {
  @ApiProperty({ example: 'email', description: 'Property that failed validation' })
  field!: string;

  @ApiProperty({
    example: ['email must be an email'],
    description: 'Human readable messages for this field',
    type: [String],
  })
  messages!: string[];
}

/**
 * The single error envelope returned by every failing request in the API.
 */
export class ApiErrorResponse {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode!: number;

  @ApiProperty({
    example: 'VALIDATION_ERROR',
    description: 'Stable, machine readable error code',
  })
  error!: string;

  @ApiProperty({ example: 'Validation failed', description: 'Human readable summary' })
  message!: string;

  @ApiPropertyOptional({ type: [ApiErrorDetail], description: 'Field level details' })
  details?: ApiErrorDetail[];

  @ApiProperty({ example: '/api/v1/health' })
  path!: string;

  @ApiProperty({ example: 'GET' })
  method!: string;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '6f1c6b4e-2d2b-4d4b-9a2c-6f9d2a5c0e11' })
  requestId!: string;
}
