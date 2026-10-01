import { fakeRealProvider } from '../helpers/real-provider';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestHarness } from '../helpers/test-app';
import { MockAllergySource } from '@/adapters/memory/mock-allergy-source';

function harness(env: Record<string, string> = {}) {
  return makeTestHarness({ env: {
    DRUGALLERGY_DATA_MODE: 'mock',
    DRUGALLERGY_PARQUET_GLOB: '/must-not-read-real-data/*.parquet',
    SERVICE_API_KEYS: 'test-api-key', SERVICE_ALLOWLIST_IPS: '203.0.113.5',
    ...env,
  } });
}

describe('third-party data mode (real container wiring, no source override)', () => {
  it('search always uses real data and refuses portal tokens even with all mock switches', async () => {
    const { app } = harness({ DRUGALLERGY_PARQUET_GLOB: '' });
    expect((await request(app).get('/auth/mode')).body.mode).toBe('real');
    expect((await request(app).post('/auth/session').send({ providerId: 'mock-pharm-001' })).status).toBe(400);
    expect((await request(app).get('/auth/login')).status).toBe(503);
    const login = await request(app).post('/api/v1/portal/auth/session').send({ providerId: 'mock-pharm-001' });
    expect(login.status).toBe(201);
    const res = await request(app).post('/api/v1/drugallergy/search')
      .set('Authorization', `Bearer ${login.body.token}`).send({ cid: 'MOCK-CID-001' });
    expect(res.status).toBe(401);
    expect(res.headers['x-drugallergy-data-mode']).toBe('real');
    expect((await request(app).post('/auth/refresh').send({ refreshToken: login.body.refreshToken })).status).toBe(401);
    const patients = await request(app).get('/api/v1/patients')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(patients.status).toBe(200);
    expect(patients.body.total).toBe(10);
  });

  it('mock lookup still requires both API key and allowed IP, retains limits and full columns', async () => {
    const { app } = harness({ SERVICE_MAX_RECORDS: '1' });
    const lookup = () => request(app).post('/api/v1/drugallergy/lookup');
    expect((await lookup().set('cf-connecting-ip', '203.0.113.5').send({ cid: 'MOCK-CID-001' })).status).toBe(401);
    expect((await lookup().set('cf-connecting-ip', '203.0.113.6').set('x-api-key', 'test-api-key')
      .send({ cid: 'MOCK-CID-001' })).status).toBe(403);
    const res = await lookup().set('cf-connecting-ip', '203.0.113.5').set('x-api-key', 'test-api-key')
      .send({ cid: 'MOCK-CID-001' });
    expect(res.status).toBe(200);
    expect(res.headers['x-drugallergy-data-mode']).toBe('mock');
    expect(res.body.count).toBe(1);
    expect(res.body).not.toHaveProperty('quota');
    expect(res.body.records[0]).toMatchObject({ CID: 'MOCK-CID-001', PID: 'MOCK-PID-001', HOSPCODE: '00000' });
    const unknown = await lookup().set('cf-connecting-ip', '203.0.113.5').set('x-api-key', 'test-api-key')
      .send({ cid: 'unknown-cid' });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ records: [], count: 0 });
  });

  it('real mode never falls back to mock when parquet is unconfigured', async () => {
    const { app } = makeTestHarness({ env: { DRUGALLERGY_DATA_MODE: 'real', DRUGALLERGY_PARQUET_GLOB: '', SERVICE_API_KEYS: 'test-api-key', SERVICE_ALLOWLIST_IPS: '203.0.113.5' }, overrides: { auth: fakeRealProvider() } });
    const login = await request(app).post('/auth/callback').send({ code: 'test-oauth-code' });
    const search = await request(app).post('/api/v1/drugallergy/search')
      .set('Authorization', `Bearer ${login.body.token}`).send({ cid: 'MOCK-CID-001' });
    expect(search.status).toBe(503);
    expect(search.headers['x-drugallergy-data-mode']).toBe('real');
    const lookup = await request(app).post('/api/v1/drugallergy/lookup')
      .set('cf-connecting-ip', '203.0.113.5').set('x-api-key', 'test-api-key').send({ cid: 'MOCK-CID-001' });
    expect(lookup.status).toBe(503);
    expect(lookup.headers['x-drugallergy-data-mode']).toBe('real');
  });

  it('supports real Provider ID auth configuration with mock third-party data', async () => {
    const { container } = harness({ AUTH_PROVIDER: 'real',
      MOPH_PROVIDER_BASE_URL: 'https://provider.example', MOPH_PROVIDER_CLIENT_ID: 'test',
      MOPH_PROVIDER_CLIENT_SECRET: 'test', MOPH_PROVIDER_REDIRECT_URI: 'https://app.example/auth/callback',
    });
    expect(container.auth.kind).toBe('real');
    expect((await container.drugAllergyService.lookupFull('MOCK-CID-002')).count).toBe(1);
  });

  it('mock source returns fresh records and respects exact CID/limit across methods', async () => {
    const source = new MockAllergySource();
    const raw = await source.queryOneRaw('MOCK-CID-001', 2);
    raw[0]!.DNAME = 'changed';
    const full = await source.queryOneFullRaw('MOCK-CID-001', 2);
    expect(full[0]!.CID).toBe('MOCK-CID-001');
    expect(full[0]!.DNAME).toContain('[MOCK]');
    expect(await source.queryOneFullRaw('MOCK-CID-001', 0)).toEqual([]);
    const multi = await source.queryByCids(['MOCK-CID-002', 'MOCK-CID-001'], 2);
    expect(multi).toHaveLength(2);
    expect(multi.every(r => r.cid === 'MOCK-CID-001')).toBe(true);
    expect(await source.queryByCids(['unknown'], 10)).toEqual([]);
  });
});
