import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { makeTestHarness, type TestHarness } from '../helpers/test-app';
import { InMemoryAuditLogRepository } from '@/adapters/memory/patient-query.memory';
import { verifyEd25519 } from '@/adapters/keys/local-key.service';

async function tokenFor(app: Express, providerId: string): Promise<string> {
  const res = await request(app).post('/auth/session').send({ providerId });
  return res.body.token as string;
}

const CBZ = {
  didstd: '100001',
  dname: 'CARBAMAZEPINE 200 MG TABLET',
  group: 'Carbamazepine',
};

function verifyBody(over: Record<string, unknown> = {}) {
  return {
    confirmedDrugs: [CBZ],
    biomarker: 'HLA-B*15:02 Positive',
    severity: 'life-threatening',
    manifestations: ['Stevens-Johnson Syndrome (SJS)'],
    crossReactiveDrugs: ['Oxcarbazepine', 'Phenytoin'],
    alternativeDrugs: ['Levetiracetam'],
    note: 'ยืนยันจากประวัติ + ผลพันธุกรรม',
    ...over,
  };
}

describe('verification API (P4) — verify / sign / reject / note', () => {
  it('P4-1: verify a subset of drugs → status verified', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001');
    const res = await request(app)
      .post('/api/v1/patients/1/verify')
      .set('Authorization', `Bearer ${token}`)
      .send(verifyBody());
    expect(res.status).toBe(201);
    expect(res.body.verification.decision).toBe('verified');
    expect(res.body.verification.confirmedDrugs).toHaveLength(1);
    expect(res.body.verification.signature).toBeTruthy();

    // สะท้อนใน list (status verified)
    const list = await request(app)
      .get('/api/v1/patients/1')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.patient.status).toBe('verified');
  });

  it('P4-2: signature verifies against the public key', async () => {
    const { app, container } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001');
    const res = await request(app)
      .post('/api/v1/patients/1/verify')
      .set('Authorization', `Bearer ${token}`)
      .send(verifyBody());
    const { canonicalPayload, signature } = res.body.verification;

    const pem = await container.keys.getPublicKeyPem('mock-pharm-001');
    expect(pem).toBeTruthy();
    expect(verifyEd25519(pem!, canonicalPayload, signature)).toBe(true);
    // แก้ payload 1 ตัวอักษร → ตรวจไม่ผ่าน
    expect(verifyEd25519(pem!, canonicalPayload + ' ', signature)).toBe(false);
  });

  it('exposes public key at GET /keys/:providerId (no auth)', async () => {
    const { app } = makeTestHarness();
    // ต้อง login สักครั้งเพื่อ enroll key ก่อน
    await tokenFor(app, 'mock-pharm-001');
    const res = await request(app).get('/api/v1/keys/mock-pharm-001');
    expect(res.status).toBe(200);
    expect(res.body.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it('P4-1b: rejects confirmed drug not in suspect list → 422', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001');
    const res = await request(app)
      .post('/api/v1/patients/1/verify')
      .set('Authorization', `Bearer ${token}`)
      .send(verifyBody({ confirmedDrugs: [{ didstd: '999', dname: 'X', group: null }] }));
    expect(res.status).toBe(422);
  });

  it('P4-4: re-verify an already verified record → 409', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001');
    await request(app)
      .post('/api/v1/patients/1/verify')
      .set('Authorization', `Bearer ${token}`)
      .send(verifyBody());
    const again = await request(app)
      .post('/api/v1/patients/1/verify')
      .set('Authorization', `Bearer ${token}`)
      .send(verifyBody());
    expect(again.status).toBe(409);
  });

  it('P4-5: reject moves record to rejected + out of pending list', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001');
    const res = await request(app)
      .post('/api/v1/patients/2/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'ประวัติไม่ชัดเจน ขอตรวจเพิ่ม' });
    expect(res.status).toBe(200);

    const pending = await request(app)
      .get('/api/v1/patients?status=pending&pageSize=100')
      .set('Authorization', `Bearer ${token}`);
    expect(pending.body.items.some((i: { id: string }) => i.id === '2')).toBe(false);
  });

  it('P4-7: note editable before stamp, rejected after', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001');
    const ok = await request(app)
      .patch('/api/v1/patients/3/note')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'สังเกตอาการเพิ่มเติม' });
    expect(ok.status).toBe(200);

    // verify id 3 แล้วลองแก้ note → 409
    await request(app)
      .post('/api/v1/patients/3/verify')
      .set('Authorization', `Bearer ${token}`)
      .send(verifyBody({ confirmedDrugs: [{ didstd: '100020', dname: 'AMOXICILLIN 500 MG CAPSULE', group: 'Penicillins' }] }));
    const after = await request(app)
      .patch('/api/v1/patients/3/note')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'แก้ทีหลัง' });
    expect(after.status).toBe(409);
  });

  it('P4-8: card preview does not persist (status stays pending)', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001');
    const res = await request(app)
      .post('/api/v1/patients/6/card/preview')
      .set('Authorization', `Bearer ${token}`)
      .send(verifyBody({ confirmedDrugs: [{ didstd: '100050', dname: 'CEFTRIAXONE 1 G INJECTION', group: 'Cephalosporins' }] }));
    expect(res.status).toBe(200);
    expect(res.body.preview.html).toContain('บัตรแพ้ยา');

    const detail = await request(app)
      .get('/api/v1/patients/6')
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.patient.status).toBe('pending');
  });

  it('P4-9: verify writes STAMP audit', async () => {
    const audit = new InMemoryAuditLogRepository();
    const { app }: TestHarness = makeTestHarness({ overrides: { auditRepo: audit } });
    const token = await tokenFor(app, 'mock-pharm-001');
    await request(app)
      .post('/api/v1/patients/1/verify')
      .set('Authorization', `Bearer ${token}`)
      .send(verifyBody());
    expect(audit.entries.some((e) => e.action === 'STAMP' && e.patientId === '1')).toBe(true);
  });

  it('cannot verify a record from another hospcode → 404', async () => {
    const { app } = makeTestHarness();
    const token = await tokenFor(app, 'mock-pharm-001'); // 10670
    const res = await request(app)
      .post('/api/v1/patients/11/verify') // 11292
      .set('Authorization', `Bearer ${token}`)
      .send(verifyBody());
    expect(res.status).toBe(404);
  });

  it('requires auth → 401', async () => {
    const { app } = makeTestHarness();
    const res = await request(app).post('/api/v1/patients/1/verify').send(verifyBody());
    expect(res.status).toBe(401);
  });
});
