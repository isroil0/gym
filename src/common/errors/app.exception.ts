import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorDetail } from '../dto/api-error.dto';
import { ErrorCode, type ErrorCodeValue } from './error-codes';

/**
 * Base exception for domain errors. Carries a stable error code alongside
 * the HTTP status so the error envelope stays consistent across the API.
 */
export class AppException extends HttpException {
  readonly errorCode: ErrorCodeValue;
  readonly details?: ApiErrorDetail[];

  constructor(
    message: string,
    status: HttpStatus,
    errorCode: ErrorCodeValue,
    details?: ApiErrorDetail[],
  ) {
    super({ message, errorCode, details }, status);
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class NotFoundError extends AppException {
  constructor(resource: string, identifier?: string | number) {
    super(
      identifier === undefined ? `${resource} not found` : `${resource} '${identifier}' not found`,
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
    );
  }
}

export class ConflictError extends AppException {
  constructor(message: string, details?: ApiErrorDetail[]) {
    super(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT, details);
  }
}

export class ValidationError extends AppException {
  constructor(message: string, details?: ApiErrorDetail[]) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, details);
  }
}

export class ForbiddenError extends AppException {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
  }
}

export class UnauthorizedError extends AppException {
  constructor(message = 'Authentication required') {
    super(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
  }
}

export class BusinessRuleError extends AppException {
  constructor(message: string, details?: ApiErrorDetail[]) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.UNPROCESSABLE_ENTITY, details);
  }
}
