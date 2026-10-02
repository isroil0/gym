import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';
import { ErrorCode } from '../src/common/errors/error-codes';

describe('Application bootstrap (e2e)', () => {
  let ctx: TestContext;
  let server: App;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('serves the API under the global /api prefix', async () => {
    await request(server).get('/api/health/live').expect(200);
    await request(server).get('/health/live').expect(404);
  });

  it('returns the consistent error envelope for unknown routes', async () => {
    const res = await request(server).get('/api/v1/not-a-route').expect(404);

    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: 404,
        error: ErrorCode.NOT_FOUND,
        path: '/api/v1/not-a-route',
        method: 'GET',
      }),
    );
    expect(res.body.requestId).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it('applies security headers', async () => {
    const res = await request(server).get('/api/health/live').expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });

  it('answers CORS preflight requests', async () => {
    const res = await request(server)
      .options('/api/health/live')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBeLessThan(400);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});
