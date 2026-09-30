import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeTestApp } from '../helpers/test-app';

describe('base path mounting (deploy under /drugallergy)', () => {
  it('supports deployed mock login and authenticated API under the same prefix', async () => {
    const app = makeTestApp({ env: {
      HTTP_BASE_PATH: '/drugallergy', AUTH_PROVIDER: 'mock',
      PUBLIC_BASE_URL: 'https://api-mophlink.moph.go.th/drugallergy',
    } });
    const mode = await request(app).get('/drugallergy/auth/mode');
    expect(mode.body).toEqual({ mode: 'mock' });
    const providers = await request(app).get('/drugallergy/auth/providers');
    expect(providers.status).toBe(200);
    const login = await request(app).post('/drugallergy/auth/session')
      .send({ providerId: providers.body.providers[0].providerId });
    expect(login.status).toBe(201);
    const patients = await request(app).get('/drugallergy/api/v1/patients')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(patients.status).toBe(200);
    expect(Array.isArray(patients.body.items)).toBe(true);
  });
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
