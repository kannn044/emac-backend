import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeTestApp } from '../helpers/test-app';

describe('base path mounting (deploy under /drugallergy)', () => {
  it('serves routes under configured base path', async () => {
    const app = makeTestApp({ env: { HTTP_BASE_PATH: '/drugallergy' } });
    const ok = await request(app).get('/drugallergy/healthz');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ status: 'ok' });

    // root ต้องไม่เจอ (ของ service อื่นบน domain เดียวกัน)
    const root = await request(app).get('/healthz');
    expect(root.status).toBe(404);
  });

  it('still serves at root when base path empty (dev)', async () => {
    const app = makeTestApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
  });
});
