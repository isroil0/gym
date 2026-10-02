import { Body, Controller, Get, HttpStatus, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { RequestIdMiddleware } from '../src/common/middleware/request-id.middleware';
import { ConflictError } from '../src/common/errors/app.exception';
import { ErrorCode } from '../src/common/errors/error-codes';

class ProbeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @Type(() => Number)
  @IsInt()
  @Min(18)
  age!: number;
}

@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() dto: ProbeDto) {
    return { received: dto };
  }

  @Get('conflict')
  conflict() {
    throw new ConflictError('Probe already exists');
  }

  @Get('boom')
  boom(): never {
    throw new Error('internal secret detail');
  }
}

/**
 * Exercises the shared ValidationPipe + AllExceptionsFilter configuration
 * through a real HTTP stack, using a throwaway controller so no probe
 * endpoint ever ships in the application itself.
 */
describe('Validation & error contract (e2e)', () => {
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    // `logger: false` keeps the deliberately-thrown 500 out of the test output.
    app = moduleRef.createNestApplication({ logger: false });
    const requestId = new RequestIdMiddleware();
    app.use(requestId.use.bind(requestId));
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid payload and transforms primitives', async () => {
    const res = await request(server)
      .post('/probe')
      .send({ name: 'Ada', email: 'ada@gym.test', age: '31' })
      .expect(HttpStatus.CREATED);

    expect(res.body.received).toEqual({ name: 'Ada', email: 'ada@gym.test', age: 31 });
  });

  it('rejects an invalid payload with per-field details', async () => {
    const res = await request(server)
      .post('/probe')
      .send({ name: '', email: 'not-an-email', age: 12 })
      .expect(HttpStatus.BAD_REQUEST);

    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: 400,
        error: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        path: '/probe',
        method: 'POST',
      }),
    );

    const fields = (res.body.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'age']));
  });

  it('rejects unknown properties instead of silently dropping them', async () => {
    const res = await request(server)
      .post('/probe')
      .send({ name: 'Ada', email: 'ada@gym.test', age: 31, isAdmin: true })
      .expect(HttpStatus.BAD_REQUEST);

    expect(res.body.error).toBe(ErrorCode.VALIDATION_ERROR);
    expect(JSON.stringify(res.body.details)).toContain('isAdmin');
  });

  it('rejects a missing body', async () => {
    await request(server).post('/probe').send({}).expect(HttpStatus.BAD_REQUEST);
  });

  it('returns the same envelope shape for a domain conflict', async () => {
    const res = await request(server).get('/probe/conflict').expect(HttpStatus.CONFLICT);

    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: 409,
        error: ErrorCode.CONFLICT,
        message: 'Probe already exists',
        method: 'GET',
      }),
    );
    expect(res.body.requestId).toBeDefined();
  });

  it('returns the same envelope shape for an unhandled error, without leaking details', async () => {
    const res = await request(server).get('/probe/boom').expect(HttpStatus.INTERNAL_SERVER_ERROR);

    expect(res.body.error).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(res.body.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('internal secret detail');
  });

  it('returns the same envelope shape for an unknown route', async () => {
    const res = await request(server).get('/does-not-exist').expect(HttpStatus.NOT_FOUND);

    expect(res.body).toEqual(
      expect.objectContaining({ success: false, statusCode: 404, error: ErrorCode.NOT_FOUND }),
    );
  });
});
