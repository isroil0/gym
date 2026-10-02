import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

/**
 * `ConfigModule.forRoot()` snapshots the environment when the module graph is
 * first imported, so each scenario resets the module registry and re-imports
 * the bootstrap after setting SWAGGER_ENABLED.
 */
async function bootAppWithSwagger(enabled: boolean): Promise<INestApplication> {
  process.env.SWAGGER_ENABLED = enabled ? 'true' : 'false';
  jest.resetModules();

  const { createApp } = await import('../src/bootstrap');
  const app = await createApp();
  await app.init();
  return app;
}

describe('Swagger / OpenAPI (e2e)', () => {
  const originalFlag = process.env.SWAGGER_ENABLED;

  afterAll(() => {
    process.env.SWAGGER_ENABLED = originalFlag;
  });

  describe('when SWAGGER_ENABLED=true', () => {
    let app: INestApplication;
    let server: App;

    beforeAll(async () => {
      app = await bootAppWithSwagger(true);
      server = app.getHttpServer() as App;
    });

    afterAll(async () => {
      await app.close();
    });

    it('serves the documentation UI', async () => {
      const res = await request(server).get('/docs').expect(200);
      expect(res.text).toContain('Gym CRM API Docs');
    });

    it('serves a valid OpenAPI JSON document', async () => {
      const res = await request(server).get('/docs-json').expect(200);

      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.info.title).toBe('Gym CRM API');
      expect(Object.keys(res.body.paths)).toContain('/api/health');
    });

    it('documents the bearer auth scheme for later phases', async () => {
      const res = await request(server).get('/docs-json').expect(200);
      expect(res.body.components.securitySchemes['access-token']).toEqual(
        expect.objectContaining({ type: 'http', scheme: 'bearer' }),
      );
    });

    it('registers the shared error schema', async () => {
      const res = await request(server).get('/docs-json').expect(200);
      expect(res.body.components.schemas.ApiErrorResponse).toBeDefined();
    });

    it('declares a tag for every planned module', async () => {
      const res = await request(server).get('/docs-json').expect(200);
      const tags = (res.body.tags as Array<{ name: string }>).map((tag) => tag.name);

      expect(tags).toEqual(
        expect.arrayContaining(['Health', 'Auth', 'Members', 'Trainers', 'Memberships']),
      );
    });
  });

  describe('when SWAGGER_ENABLED=false', () => {
    let app: INestApplication;
    let server: App;

    beforeAll(async () => {
      app = await bootAppWithSwagger(false);
      server = app.getHttpServer() as App;
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not expose the documentation', async () => {
      await request(server).get('/docs').expect(404);
      await request(server).get('/docs-json').expect(404);
    });

    it('still serves the API itself', async () => {
      await request(server).get('/api/health/live').expect(200);
    });
  });
});
