import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiErrorDetail, ApiErrorResponse } from '../dto/api-error.dto';
import { AppException } from '../errors/app.exception';
import { ErrorCode, errorCodeForStatus, type ErrorCodeValue } from '../errors/error-codes';

/** Statuses at or above this are logged at error level with a stack trace. */
const SERVER_ERROR_THRESHOLD = 500;

interface NormalizedError {
  status: number;
  errorCode: ErrorCodeValue;
  message: string;
  details?: ApiErrorDetail[];
}

/**
 * Converts every thrown value into the single API error envelope.
 * Nothing else in the application is allowed to shape an error response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const normalized = this.normalize(exception);

    const body: ApiErrorResponse = {
      success: false,
      statusCode: normalized.status,
      error: normalized.errorCode,
      message: normalized.message,
      ...(normalized.details?.length ? { details: normalized.details } : {}),
      path: request.originalUrl ?? request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId: request.id ?? 'unknown',
    };

    if (normalized.status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        `${body.method} ${body.path} -> ${body.statusCode} ${body.error}: ${body.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${body.method} ${body.path} -> ${body.statusCode} ${body.error}: ${body.message}`,
      );
    }

    response.status(normalized.status).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        errorCode: exception.errorCode,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaKnownError(exception);
    }

    if (
      exception instanceof Prisma.PrismaClientValidationError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ErrorCode.DATABASE_ERROR,
        message: 'A database error occurred',
      };
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Database is unavailable',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { status, errorCode: errorCodeForStatus(status), message: payload };
    }

    const record = payload as Record<string, unknown>;
    const rawMessage = record['message'];
    const explicitCode = record['errorCode'];

    // The global ValidationPipe produces { message: string[] }.
    if (Array.isArray(rawMessage)) {
      return {
        status,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: this.groupValidationMessages(rawMessage.map(String)),
      };
    }

    return {
      status,
      errorCode:
        typeof explicitCode === 'string'
          ? (explicitCode as ErrorCodeValue)
          : errorCodeForStatus(status),
      message:
        typeof rawMessage === 'string' ? rawMessage : (exception.message ?? 'Request failed'),
      details: Array.isArray(record['details'])
        ? (record['details'] as ApiErrorDetail[])
        : undefined,
    };
  }

  private fromPrismaKnownError(exception: Prisma.PrismaClientKnownRequestError): NormalizedError {
    const target = exception.meta?.['target'];
    const fields = Array.isArray(target) ? target.map(String) : [];

    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.UNIQUE_CONSTRAINT,
          message:
            fields.length > 0
              ? `A record with this ${fields.join(', ')} already exists`
              : 'A record with these values already exists',
          details: fields.map((field) => ({ field, messages: ['must be unique'] })),
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.FOREIGN_KEY_CONSTRAINT,
          message: 'Related record constraint failed',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          errorCode: ErrorCode.NOT_FOUND,
          message: 'Record not found',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          errorCode: ErrorCode.DATABASE_ERROR,
          message: 'A database error occurred',
        };
    }
  }

  /** Turns flat `class-validator` strings into per-field detail entries. */
  private groupValidationMessages(messages: string[]): ApiErrorDetail[] {
    const grouped = new Map<string, string[]>();

    for (const message of messages) {
      const field = message.split(' ')[0] ?? '_';
      const existing = grouped.get(field);
      if (existing) {
        existing.push(message);
      } else {
        grouped.set(field, [message]);
      }
    }

    return [...grouped.entries()].map(([field, msgs]) => ({ field, messages: msgs }));
  }
}
