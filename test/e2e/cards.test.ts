import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { makeTestHarness } from '../helpers/test-app';
import { InMemoryCardRepository } from '@/adapters/memory/card.memory';

async function tokenFor(app: Express, providerId: string): Promise<string> {
  const res = await request(app).post('/auth/session').send({ providerId });
  return res.body.token as string;
}

const body = {
  confirmedDrugs: [
    { didstd: '100001', dname: 'CARBAMAZEPINE 200 MG TABLET', group: 'Carbamazepine' },
  ],
  biomarker: 'HLA-B*15:02 Positive',
  severity: 'life-threatening',
  manifestations: ['SJS'],
  crossReactiveDrugs: ['Oxcarbazepine'],
  alternativeDrugs: ['Levetiracetam'],
  note: 'ok',
};

async function issueCard(app: Express) {
  const token = await tokenFor(app, 'mock-pharm-001');
  const res = await request(app)
    .post('/api/v1/patients/1/verify')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return { token, verify: res };
}

describe('cards API (P5) — issue / verify / embed', () => {
  it('P5-1: verify issues an immutable card with links', async () => {
    const { app } = makeTestHarness();
    const { verify } = await issueCard(app);
    expect(verify.status).toBe(201);
    expect(verify.body.card.id).toBeTruthy();
    expect(verify.body.card.renderToken).toBeTruthy();
    expect(verify.body.card.verifyUrl).toContain('/cards/');
    expect(verify.body.card.embedUrl).toContain('/embed/card/');
  });

  it('P5-2: public GET /cards/:id/verify → valid:true (no auth)', async () => {
    const { app } = makeTestHarness();
    const { verify } = await issueCard(app);
    const cardId = verify.body.card.id;
    const res = await request(app).get(`/api/v1/cards/${cardId}/verify`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.hospcode).toBe('10670');
    expect(res.body.confirmedDrugs).toHaveLength(1);
    expect(res.body.issuer.name).toBeTruthy();
  });

  it('P5-3: tampering the signed payload makes verification invalid', async () => {
    const cardRepo = new InMemoryCardRepository();
    const { app } = makeTestHarness({ overrides: { cardRepo } });
    const { verify } = await issueCard(app);
    const cardId = verify.body.card.id;

    const card = await cardRepo.findById(cardId);
    expect(card).toBeTruthy();
    // จำลองการแก้เนื้อหา 1 ตัวอักษร (canonical เปลี่ยน แต่ signature เดิม)
    await cardRepo.save({ ...card!, canonicalPayload: card!.canonicalPayload + ' ' });

    const res = await request(app).get(`/api/v1/cards/${cardId}/verify`);
    expect(res.body.valid).toBe(false);
  });

  it('P5-4: embed returns official MOPH card HTML with CSP frame-ancestors', async () => {
    const { app } = makeTestHarness();
    const { verify } = await issueCard(app);
    const token = verify.body.card.renderToken;
    const res = await request(app).get(`/embed/card/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toContain('frame-ancestors');
    // ฟอร์แมตบัตรราชการ
    expect(res.text).toContain('บัตรแพ้ยา/เตือนเรื่องยา');
    expect(res.text).toContain('ข้อควรปฏิบัติ');
    expect(res.text).toContain('ยาที่สงสัย');
    expect(res.text).toContain('ผลการ');
    expect(res.text).toContain('ใช่แน่นอน'); // legend/assessment label
    // ข้อมูลผู้ป่วย + ยา
    expect(res.text).toContain('นายสมชาย เทวกุล');
    expect(res.text).toContain('CARBAMAZEPINE 200 MG TABLET');
    expect(res.text).toContain('โรงพยาบาลศิริราช');
  });

  it('unknown card id/token → 404', async () => {
    const { app } = makeTestHarness();
    const a = await request(app).get('/api/v1/cards/nope/verify');
    const b = await request(app).get('/embed/card/nope');
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
  });

  it('GET /patients/:id/card (tenant) returns the issued card; other hospcode 404', async () => {
    const { app } = makeTestHarness();
    const { token } = await issueCard(app);
    const ok = await request(app)
      .get('/api/v1/patients/1/card')
      .set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.links.verifyUrl).toContain('/cards/');

    // เภสัชอีก รพ. ดึงบัตรของ record 1 (10670) ไม่ได้
    const other = await tokenFor(app, 'mock-pharm-002'); // 11292
    const denied = await request(app)
      .get('/api/v1/patients/1/card')
      .set('Authorization', `Bearer ${other}`);
    expect(denied.status).toBe(404);
  });

  it('card metadata requires auth (GET /cards/:id)', async () => {
    const { app } = makeTestHarness();
    const { verify } = await issueCard(app);
    const res = await request(app).get(`/api/v1/cards/${verify.body.card.id}`);
    expect(res.status).toBe(401);
  });
});
