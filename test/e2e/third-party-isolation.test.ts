import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { makeTestHarness } from '../helpers/test-app';
import { fakeRealProvider } from '../helpers/real-provider';
import { SessionService } from '@/modules/auth/session.service';
import { MockAuthProvider } from '@/adapters/auth/mock-auth.provider';

let dir: string;
let parquet: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'emac-isolation-'));
  parquet = join(dir, 'synthetic.parquet');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();
  try {
    await conn.run(`COPY (SELECT '00000' AS HOSPCODE, 'TEST-PID' AS PID,
      'TEST-CID' AS CID, '2026-01-01' AS DATERECORD, '2026-01-01' AS D_UPDATE,
      '2026-01-01' AS HDC_DATE, 'PARQUET-TEST-DRUG' AS DNAME)
      TO '${parquet.replace(/'/g, "''")}' (FORMAT PARQUET)`);
  } finally { conn.closeSync(); db.closeSync(); }
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('third-party production contract isolated from portal', () => {
  it('real Provider ID authorize is available while AUTH_PROVIDER and portal are mock', async () => {
    const { app, container } = makeTestHarness({ env: {
      AUTH_PROVIDER: 'mock', PORTAL_AUTH_PROVIDER: 'mock', DRUGALLERGY_DATA_MODE: 'mock',
      MOPH_PROVIDER_BASE_URL: 'https://provider.id.th', MOPH_PROVIDER_CLIENT_ID: 'test-client',
      MOPH_PROVIDER_CLIENT_SECRET: 'test-secret', MOPH_PROVIDER_REDIRECT_URI: 'https://api.example/drugallergy/auth/callback',
    } });
    expect(container.auth.kind).toBe('real');
    const login = await request(app).get('/auth/login').query({ state: 'partner-state' });
    expect(login.status).toBe(302);
    const url = new URL(login.headers.location ?? '');
    expect(url.origin).toBe('https://provider.id.th');
    expect(url.searchParams.get('client_id')).toBe('test-client');
    expect(url.searchParams.get('state')).toBe('partner-state');
    expect((await request(app).get('/api/v1/portal/auth/mode')).body.mode).toBe('mock');
  });

  it('search reads parquet despite mock flags; sessions and refresh cannot cross channels', async () => {
    const { app, container } = makeTestHarness({ env: {
      HTTP_BASE_PATH: '/drugallergy', AUTH_PROVIDER: 'mock', PORTAL_AUTH_PROVIDER: 'mock',
      DRUGALLERGY_DATA_MODE: 'mock', DRUGALLERGY_PARQUET_GLOB: parquet,
      DRUGALLERGY_DAILY_LIMIT: '1',
    }, overrides: { auth: fakeRealProvider() } });
    const base = '/drugallergy';
    const real = await request(app).post(`${base}/auth/callback`).send({ code: 'test-oauth-code' });
    expect(real.status).toBe(201);
    const portal = await request(app).post(`${base}/api/v1/portal/auth/session`).send({ providerId: 'mock-pharm-001' });
    expect(portal.status).toBe(201);
    const search = await request(app).post(`${base}/api/v1/drugallergy/search`)
      .set('Authorization', `Bearer ${real.body.token}`).send({ cid: 'TEST-CID' });
    expect(search.status).toBe(200);
    expect(search.headers['x-drugallergy-data-mode']).toBe('real');
    expect(search.body.records[0].DNAME).toBe('PARQUET-TEST-DRUG');
    for (const key of ['HOSPCODE', 'PID', 'CID']) expect(search.body.records[0]).not.toHaveProperty(key);
    expect(search.body.quota.remaining).toBe(0);
    expect((await request(app).get(`${base}/api/v1/patients`).set('Authorization', `Bearer ${real.body.token}`)).status).toBe(401);
    expect((await request(app).post(`${base}/api/v1/drugallergy/search`).set('Authorization', `Bearer ${portal.body.token}`).send({ cid: 'TEST-CID' })).status).toBe(401);
    expect((await request(app).post(`${base}/auth/refresh`).send({ refreshToken: portal.body.refreshToken })).status).toBe(401);
    expect((await request(app).post(`${base}/api/v1/portal/auth/refresh`).send({ refreshToken: real.body.refreshToken })).status).toBe(401);
    expect((await request(app).post(`${base}/auth/refresh`).send({ refreshToken: real.body.refreshToken })).status).toBe(201);
    expect((await request(app).post(`${base}/api/v1/portal/auth/refresh`).send({ refreshToken: portal.body.refreshToken })).status).toBe(201);
    // Old shared tokens could have come from mock login: neither channel accepts them.
    const old = new SessionService(container.config.session.jwtSecret, 1800, 43200, container.clock);
    const info = await new MockAuthProvider().authenticate('mock-pharm-001');
    const legacy = old.issue(info, 'test-key');
    expect((await request(app).get(`${base}/auth/me`).set('Authorization', `Bearer ${legacy.token}`)).status).toBe(401);
    expect((await request(app).post(`${base}/auth/refresh`).send({ refreshToken: legacy.refreshToken })).status).toBe(401);
  });
});
