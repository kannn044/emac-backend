/**
 * POST /api/v1/drugallergy/search — e2e (single CID, auth + validation + quota)
 * ใช้ mock auth (default test) เพื่อได้ session token; override allergySource ด้วย fake
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeTestHarness } from '../helpers/test-app';
import type { AllergySource } from '@/modules/drugallergy/ports';
import type { AllergyRecord } from '@/modules/drugallergy/types';

class FakeSource implements AllergySource {
  constructor(private readonly total: number) {}
  async queryByCids(): Promise<AllergyRecord[]> {
    return [];
  }
  async queryOneRaw(_cid: string, limit: number): Promise<Record<string, string | null>[]> {
    const n = Math.min(this.total, limit);
    // จำลอง: ทุกคอลัมน์ยกเว้น HOSPCODE, PID, CID
    return Array.from({ length: n }, (_, i) => ({
      DATERECORD: '2026-01-01', DRUGALLERGY: 'D1', DNAME: `drug-${i}`,
      TYPEDX: '2', ALEVEL: '3', SYMPTOM: 'rash', INFORMANT: '1',
      INFORMHOSP: '11436', D_UPDATE: '2016-08-22 12:11:09', PROVIDER: '18',
      HOSPCODE9: null, HOSP9_INFORMHOSP: null, HDC_DATE: '2026-07-13 21:45:13',
    }));
  }
  async queryOneFullRaw(_cid: string, limit: number): Promise<Record<string, string | null>[]> {
    const n = Math.min(this.total, limit);
    // จำลอง: ทุกคอลัมน์ (รวม HOSPCODE, PID, CID)
    return Array.from({ length: n }, (_, i) => ({
      HOSPCODE: '10670', PID: `p${i}`, CID: '1100700000001',
      DATERECORD: '2026-01-01', DRUGALLERGY: 'D1', DNAME: `drug-${i}`,
      TYPEDX: '2', ALEVEL: '3', SYMPTOM: 'rash',
    }));
  }
}

function harness(total = 5, env: Record<string, string> = {}) {
  return makeTestHarness({
    env: { DRUGALLERGY_DAILY_LIMIT: '100', ...env },
    overrides: { allergySource: new FakeSource(total) },
  });
}

async function token(app: ReturnType<typeof harness>['app']): Promise<string> {
  const res = await request(app).post('/auth/session').send({ providerId: 'mock-pharm-001' });
  return res.body.token as string;
}

describe('POST /api/v1/drugallergy/lookup (service M2M — IP + API key)', () => {
  function svcHarness(total = 3) {
    return makeTestHarness({
      env: {
        SERVICE_API_KEYS: 'k-abc,k-def',
        SERVICE_ALLOWLIST_IPS: '203.0.113.5',
        SERVICE_CLIENT_IP_HEADER: 'cf-connecting-ip',
      },
      overrides: { allergySource: new FakeSource(total) },
    });
  }

  it('IP ถูก + API key ถูก → 200 คืนทุกคอลัมน์ (รวม HOSPCODE/PID/CID) ไม่มี quota', async () => {
    const { app } = svcHarness(3);
    const res = await request(app)
      .post('/api/v1/drugallergy/lookup')
      .set('cf-connecting-ip', '203.0.113.5')
      .set('x-api-key', 'k-abc')
      .send({ cid: '1100700000001' });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    const row = res.body.records[0];
    expect(row).toHaveProperty('HOSPCODE');
    expect(row).toHaveProperty('PID');
    expect(row).toHaveProperty('CID');
    expect(res.body).not.toHaveProperty('quota'); // ไม่มีโควตา
  });

  it('IP นอก allowlist → 403', async () => {
    const { app } = svcHarness();
    const res = await request(app)
      .post('/api/v1/drugallergy/lookup')
      .set('cf-connecting-ip', '8.8.8.8')
      .set('x-api-key', 'k-abc')
      .send({ cid: '1100700000001' });
    expect(res.status).toBe(403);
  });

  it('API key ผิด → 401', async () => {
    const { app } = svcHarness();
    const res = await request(app)
      .post('/api/v1/drugallergy/lookup')
      .set('cf-connecting-ip', '203.0.113.5')
      .set('x-api-key', 'wrong')
      .send({ cid: '1100700000001' });
    expect(res.status).toBe(401);
  });

  it('ไม่ตั้งค่า service (default) → 503 ปิด endpoint', async () => {
    const { app } = makeTestHarness({ overrides: { allergySource: new FakeSource(3) } });
    const res = await request(app)
      .post('/api/v1/drugallergy/lookup')
      .set('cf-connecting-ip', '203.0.113.5')
      .set('x-api-key', 'k-abc')
      .send({ cid: '1100700000001' });
    expect(res.status).toBe(503);
  });
});

describe('POST /api/v1/drugallergy/search (single CID)', () => {
  it('ไม่มี token → 401', async () => {
    const { app } = harness();
    const res = await request(app).post('/api/v1/drugallergy/search').send({ cid: '1' });
    expect(res.status).toBe(401);
  });

  it('body ไม่มี cid → 400', async () => {
    const { app } = harness();
    const t = await token(app);
    const res = await request(app)
      .post('/api/v1/drugallergy/search')
      .set('Authorization', `Bearer ${t}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('คืน records (ไม่มี HOSPCODE/PID/CID) + quota', async () => {
    const { app } = harness(5);
    const t = await token(app);
    const res = await request(app)
      .post('/api/v1/drugallergy/search')
      .set('Authorization', `Bearer ${t}`)
      .send({ cid: 'REDACTED_CID' });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(5);
    expect(res.body.truncated).toBe(false);
    expect(res.body.records).toHaveLength(5);
    const row = res.body.records[0];
    expect(row).not.toHaveProperty('HOSPCODE');
    expect(row).not.toHaveProperty('PID');
    expect(row).not.toHaveProperty('CID');
    expect(row.DNAME).toBe('drug-0');
    expect(row).toHaveProperty('HDC_DATE');
    expect(res.body.quota).toMatchObject({ limit: 100, used: 5, remaining: 95 });
    expect(res.body.quota.resetAt).toMatch(/T17:00:00/); // เที่ยงคืน ICT
  });

  it('ชนโควตา → partial + truncated', async () => {
    const { app } = harness(80, { DRUGALLERGY_DAILY_LIMIT: '100' });
    const t = await token(app);
    await request(app).post('/api/v1/drugallergy/search')
      .set('Authorization', `Bearer ${t}`).send({ cid: 'REDACTED_CID' }); // used 80
    const r = await request(app).post('/api/v1/drugallergy/search')
      .set('Authorization', `Bearer ${t}`).send({ cid: 'REDACTED_CID' });
    expect(r.body.count).toBe(20);
    expect(r.body.truncated).toBe(true);
    expect(r.body.quota.remaining).toBe(0);
  });
});
