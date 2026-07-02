import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeTestApp } from '../helpers/test-app';

async function loginAs(app: ReturnType<typeof makeTestApp>, providerId: string) {
  return request(app).post('/auth/session').send({ providerId });
}

describe('auth (P2 mock) — login / session / identity', () => {
  it('lists mock provider profiles for dev login', async () => {
    const app = makeTestApp();
    const res = await request(app).get('/auth/providers');
    expect(res.status).toBe(200);
    const ids = res.body.providers.map((p: { providerId: string }) => p.providerId);
    expect(ids).toContain('mock-pharm-001');
  });

  it('mock login issues a session JWT + profile', async () => {
    const app = makeTestApp();
    const res = await loginAs(app, 'mock-pharm-001');
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.profile.hospcode).toBe('10670');
    expect(res.body.profile.keyId).toBeTruthy();
  });

  it('P2-5: logging in twice reuses the same enrolled key', async () => {
    const app = makeTestApp();
    const a = await loginAs(app, 'mock-pharm-001');
    const b = await loginAs(app, 'mock-pharm-001');
    expect(b.body.profile.keyId).toBe(a.body.profile.keyId);
  });

  it('P2-6: protected /auth/me without token → 401', async () => {
    const app = makeTestApp();
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('accepts a valid token on /auth/me', async () => {
    const app = makeTestApp();
    const login = await loginAs(app, 'mock-pharm-001');
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.identity.providerId).toBe('mock-pharm-001');
    expect(res.body.identity.role).toBe('pharmacist');
  });

  it('rejects a garbage token → 401', async () => {
    const app = makeTestApp();
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('P2-2: non-medical personnel cannot log in → 403', async () => {
    const app = makeTestApp();
    const res = await loginAs(app, 'mock-nonmedical-001');
    expect(res.status).toBe(403);
  });

  it('rejects unknown provider → 401', async () => {
    const app = makeTestApp();
    const res = await loginAs(app, 'does-not-exist');
    expect(res.status).toBe(401);
  });

  it('rollout allowlist: hospcode not in pilot → 403', async () => {
    // อนุญาตเฉพาะ 99999 → mock-pharm-001 (10670) ต้องถูกปฏิเสธ
    const app = makeTestApp({ env: { HOSPCODE_ALLOWLIST: '99999' } });
    const res = await loginAs(app, 'mock-pharm-001');
    expect(res.status).toBe(403);
  });
});
