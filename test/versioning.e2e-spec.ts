import { Controller, Get, type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

@Controller({ path: 'things' })
class V1Controller {
  @Get()
  list() {
    return { version: 'default' };
  }
}

@Controller({ path: 'things', version: '2' })
class V2Controller {
  @Get()
  list() {
    return { version: '2' };
  }
}

/**
 * Verifies that URI versioning behaves the way later phases will rely on:
 * routes land under /api/v1 by default and an explicit version wins.
 */
describe('API versioning (e2e)', () => {
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [V1Controller, V2Controller],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  it('routes an unversioned controller under the default version', async () => {
    const res = await request(server).get('/api/v1/things').expect(200);
    expect(res.body.version).toBe('default');
  });

  it('routes an explicitly versioned controller under its own version', async () => {
    const res = await request(server).get('/api/v2/things').expect(200);
    expect(res.body.version).toBe('2');
  });

  it('rejects a request without a version segment', async () => {
    await request(server).get('/api/things').expect(404);
  });
});
