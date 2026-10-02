import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ConflictError, NotFoundError } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import type { ApiErrorResponse } from '../dto/api-error.dto';

interface Captured {
  status: number;
  body: ApiErrorResponse;
}

function createHost(captured: Captured): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: ApiErrorResponse) {
      captured.body = payload;
      return this;
    },
  };

  const request = {
    originalUrl: '/api/v1/members',
    url: '/api/v1/members',
    method: 'POST',
    id: 'req-123',
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let captured: Captured;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    captured = {} as Captured;
    host = createHost(captured);
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('always emits the full error envelope', () => {
    filter.catch(new NotFoundException('Member not found'), host);

    expect(captured.body).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        error: ErrorCode.NOT_FOUND,
        message: 'Member not found',
        path: '/api/v1/members',
        method: 'POST',
        requestId: 'req-123',
      }),
    );
    expect(typeof captured.body.timestamp).toBe('string');
    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
  });

  it('maps a domain AppException to its own error code', () => {
    filter.catch(new ConflictError('Member already has an active membership'), host);

    expect(captured.status).toBe(HttpStatus.CONFLICT);
    expect(captured.body.error).toBe(ErrorCode.CONFLICT);
    expect(captured.body.message).toBe('Member already has an active membership');
  });

  it('formats a NotFoundError with its identifier', () => {
    filter.catch(new NotFoundError('Member', 'abc'), host);

    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body.message).toBe("Member 'abc' not found");
  });

  it('groups ValidationPipe messages into per-field details', () => {
    filter.catch(
      new BadRequestException({
        message: ['email must be an email', 'email should not be empty', 'age must be a number'],
        error: 'Bad Request',
        statusCode: 400,
      }),
      host,
    );

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body.error).toBe(ErrorCode.VALIDATION_ERROR);
    expect(captured.body.message).toBe('Validation failed');
    expect(captured.body.details).toEqual([
      { field: 'email', messages: ['email must be an email', 'email should not be empty'] },
      { field: 'age', messages: ['age must be a number'] },
    ]);
  });

  it('maps a Prisma unique constraint violation to 409', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.0.0',
      meta: { target: ['email'] },
    });

    filter.catch(error, host);

    expect(captured.status).toBe(HttpStatus.CONFLICT);
    expect(captured.body.error).toBe(ErrorCode.UNIQUE_CONSTRAINT);
    expect(captured.body.details).toEqual([{ field: 'email', messages: ['must be unique'] }]);
  });

  it('maps a Prisma missing-record error to 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '6.0.0',
    });

    filter.catch(error, host);

    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body.error).toBe(ErrorCode.NOT_FOUND);
  });

  it('hides internal details of an unexpected error', () => {
    filter.catch(new Error('connection string leaked: postgres://user:pw@host'), host);

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body.error).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(captured.body.message).toBe('Internal server error');
  });

  it('falls back to "unknown" when no request id is present', () => {
    const local: Captured = {} as Captured;
    const bareHost = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/x', method: 'GET' }),
        getResponse: () => ({
          status(code: number) {
            local.status = code;
            return this;
          },
          json(payload: ApiErrorResponse) {
            local.body = payload;
            return this;
          },
        }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new NotFoundException(), bareHost);
    expect(local.body.requestId).toBe('unknown');
  });
});
