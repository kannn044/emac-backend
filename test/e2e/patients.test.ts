import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { makeTestHarness } from '../helpers/test-app';
import { InMemoryAuditLogRepository } from '@/adapters/memory/patient-query.memory';

async function tokenFor(app: Express, providerId: string): Promise<string> {
  const res = await request(app).post('/auth/session').send({ providerId });
  return res.body.token as string;
}

describe('patients API (P3) — list / detail / tenant / audit', () => {
  it('P2-6: requires auth → 401 without token', async () => {
    const { app } = makeTestHarness();
    const res = await request(app).get('/api/v1/patients');
    expect(res.status).toBe(401);
  });

  it('P3-1: pharmacist lists only their hospcode (10670)', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001'); // hospcode 10670
    const res = await request(app)
      .get('/api/v1/patients?pageSize=100')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(10);
    expect(res.body.items.length).toBe(10);
  });

  it('another hospcode sees a different set (11292)', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-002'); // hospcode 11292
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.total).toBe(2);
  });

  it('P3-2: hospcode in query is ignored (uses token)', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001'); // 10670
    const res = await request(app)
      .get('/api/v1/patients?hospcode=11292&pageSize=100')
      .set('Authorization', `Bearer ${token}`);
    // ยังเห็นของ 10670 (10) ไม่ใช่ 11292 (2)
    expect(res.body.total).toBe(10);
  });

  it('P3-3: status filter + paging', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001');
    const res = await request(app)
      .get('/api/v1/patients?status=pending&pageSize=3&page=1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(3);
    expect(res.body.items.every((i: { status: string }) => i.status === 'pending')).toBe(true);
  });

  it('rejects invalid query (bad pageSize)', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001');
    const res = await request(app)
      .get('/api/v1/patients?pageSize=0')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('P3-5: detail returns suspect_drugs + writes VIEW audit', async () => {
    const audit = new InMemoryAuditLogRepository();
    const { app } = makeTestHarness({ overrides: { auditRepo: audit } });
    const token = await tokenFor(app, 'mock-pharm-001');
    const res = await request(app)
      .get('/api/v1/patients/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.patient.suspectDrugs.length).toBeGreaterThan(0);
    expect(res.body.patient.sourceHospcode).toBe('10670');
    // audit VIEW ถูกเขียน
    const views = audit.entries.filter((e) => e.action === 'VIEW');
    expect(views.length).toBe(1);
    expect(views[0]!.patientId).toBe('1');
    expect(views[0]!.providerId).toBe('mock-pharm-001');
  });

  it('P3-6: detail of another hospcode → 404 (no leak)', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001'); // 10670
    // id 11 เป็นของ 11292
    const res = await request(app)
      .get('/api/v1/patients/11')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
