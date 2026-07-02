import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeTestApp, StubProbe } from '../helpers/test-app';

describe('health endpoints (P0)', () => {
  it('P0-1: GET /healthz → 200 {status:"ok"}', async () => {
    const app = makeTestApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('P0-2a: GET /readyz → 200 when DB ok', async () => {
    const app = makeTestApp({ probes: [new StubProbe('postgres', true)] });
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks).toContainEqual({ name: 'postgres', ok: true });
  });

  it('P0-2b: GET /readyz → 503 when DB down', async () => {
    const app = makeTestApp({ probes: [new StubProbe('postgres', false)] });
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  it('P0-5: unknown route → 404 standard error shape', async () => {
    const app = makeTestApp();
    const res = await request(app).get('/no/such/route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('propagates incoming x-request-id', async () => {
    const app = makeTestApp();
    const res = await request(app).get('/healthz').set('x-request-id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});
