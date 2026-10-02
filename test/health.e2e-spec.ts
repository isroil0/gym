import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

describe('Health (e2e)', () => {
  let ctx: TestContext;
  let server: App;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('GET /api/health reports every indicator as up', async () => {
    const res = await request(server).get('/api/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.info.database.status).toBe('up');
    expect(res.body.info.memory_heap.status).toBe('up');
    expect(res.body.error).toEqual({});
  });

  it('GET /api/health confirms the PostgreSQL connection with a timing', async () => {
    const res = await request(server).get('/api/health').expect(200);
    expect(typeof res.body.details.database.responseTimeMs).toBe('number');
  });

  it('GET /api/health/live answers without touching the database', async () => {
    const res = await request(server).get('/api/health/live').expect(200);

    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('is version neutral (no /v1 segment required)', async () => {
    await request(server).get('/api/v1/health').expect(404);
  });

  it('echoes a correlation id on every response', async () => {
    const res = await request(server).get('/api/health/live').expect(200);
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('reuses a caller supplied correlation id', async () => {
    const res = await request(server)
      .get('/api/health/live')
      .set('x-request-id', 'caller-trace-1')
      .expect(200);

    expect(res.headers['x-request-id']).toBe('caller-trace-1');
  });
});
