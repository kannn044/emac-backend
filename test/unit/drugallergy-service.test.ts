/**
 * DrugAllergyService — quota logic, partial return, truncation
 */
import { describe, it, expect } from 'vitest';
import { DrugAllergyService, normalizeCids } from '@/modules/drugallergy/drugallergy.service';
import { InMemoryAllergyQuotaStore } from '@/adapters/memory/allergy-quota.memory';
import { ictQuotaDate, ictNextResetAt } from '@/modules/drugallergy/quota-clock';
import type { AllergySource } from '@/modules/drugallergy/ports';
import type { AllergyRecord } from '@/modules/drugallergy/types';
import type { Clock } from '@/ports/index';

function rec(cid: string, i: number): AllergyRecord {
  return {
    hospcode: '10670', pid: `p${i}`, cid,
    dateRecord: '2026-01-01', drugAllergy: 'D1', dname: `drug-${i}`,
    typeDx: '1', aLevel: '3', symptom: 'rash', informant: null,
    informHosp: null, provider: null, hospcode9: null,
    hosp9InformHosp: null, dateUpdate: null,
  };
}

/** fake source: คืน n record ต่อการ query (จำลองข้อมูลใน parquet) */
class FakeSource implements AllergySource {
  lastLimit = 0;
  constructor(private readonly total: number) {}
  async queryByCids(_cids: string[], limit: number): Promise<AllergyRecord[]> {
    this.lastLimit = limit;
    const n = Math.min(this.total, limit);
    return Array.from({ length: n }, (_, i) => rec('1111111111111', i));
  }
  async queryOneRaw(_cid: string, limit: number): Promise<Record<string, string | null>[]> {
    this.lastLimit = limit;
    const n = Math.min(this.total, limit);
    // จำลอง: ทุกคอลัมน์ยกเว้น HOSPCODE, PID, CID
    return Array.from({ length: n }, (_, i) => ({
      DATERECORD: '2026-01-01', DRUGALLERGY: 'D1', DNAME: `drug-${i}`,
      TYPEDX: '2', ALEVEL: '3', SYMPTOM: 'rash',
    }));
  }
}

const fixedClock: Clock = { now: () => new Date('2026-07-15T05:00:00Z') };

function makeService(source: AllergySource, limit = 100, maxCids = 5000) {
  return new DrugAllergyService(
    source,
    new InMemoryAllergyQuotaStore(),
    fixedClock,
    limit,
    maxCids,
  );
}

describe('normalizeCids', () => {
  it('trim + ตัดว่าง + dedup คงลำดับ', () => {
    expect(normalizeCids([' 111 ', '111', '', '222', '  '])).toEqual(['111', '222']);
  });
});

describe('DrugAllergyService.search', () => {
  it('คืน record ปกติเมื่อโควตาเหลือพอ + นับโควตา', async () => {
    const svc = makeService(new FakeSource(5), 100);
    const r = await svc.search({ cids: ['1111111111111'], clientKey: '10670' });
    expect(r.count).toBe(5);
    expect(r.truncated).toBe(false);
    expect(r.quota.used).toBe(5);
    expect(r.quota.remaining).toBe(95);
    expect(r.quota.limit).toBe(100);
  });

  it('สะสมโควตาข้าม request', async () => {
    const svc = makeService(new FakeSource(30), 100);
    await svc.search({ cids: ['1111111111111'], clientKey: '10670' });
    const r2 = await svc.search({ cids: ['1111111111111'], clientKey: '10670' });
    expect(r2.quota.used).toBe(60);
  });

  it('ตัดผล + truncated เมื่อชนโควตา (partial return)', async () => {
    const svc = makeService(new FakeSource(50), 100);
    await svc.search({ cids: ['1111111111111'], clientKey: '10670' }); // used 50
    const r = await svc.search({ cids: ['1111111111111'], clientKey: '10670' }); // remaining 50, matched 50 → ครบพอดี
    expect(r.count).toBe(50);
    expect(r.truncated).toBe(false);
    expect(r.quota.used).toBe(100);
    const r3 = await svc.search({ cids: ['1111111111111'], clientKey: '10670' }); // remaining 0
    expect(r3.count).toBe(0);
    expect(r3.truncated).toBe(true);
  });

  it('remaining น้อยกว่าจำนวน match → คืนเท่าที่เหลือ + truncated', async () => {
    const svc = makeService(new FakeSource(80), 100);
    await svc.search({ cids: ['1111111111111'], clientKey: '10670' }); // used 80
    const r = await svc.search({ cids: ['1111111111111'], clientKey: '10670' }); // remaining 20, matched 80
    expect(r.count).toBe(20);
    expect(r.truncated).toBe(true);
    expect(r.quota.used).toBe(100);
    expect(r.quota.remaining).toBe(0);
  });

  it('โควตาแยกตาม client (hospcode)', async () => {
    const svc = makeService(new FakeSource(60), 100);
    const a = await svc.search({ cids: ['1111111111111'], clientKey: '10670' });
    const b = await svc.search({ cids: ['1111111111111'], clientKey: '11292' });
    expect(a.quota.used).toBe(60);
    expect(b.quota.used).toBe(60); // แยกกัน ไม่รวม
  });

  it('cids ว่าง → 400', async () => {
    const svc = makeService(new FakeSource(5));
    await expect(svc.search({ cids: [], clientKey: '10670' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('cids เกิน max → 400', async () => {
    const svc = makeService(new FakeSource(5), 100, 2);
    await expect(
      svc.search({ cids: ['1', '2', '3'], clientKey: '10670' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('query ด้วย limit = remaining+1 เพื่อรู้ว่ามีเกิน', async () => {
    const source = new FakeSource(5);
    const svc = makeService(source, 100);
    await svc.search({ cids: ['1111111111111'], clientKey: '10670' });
    expect(source.lastLimit).toBe(101); // remaining(100)+1
  });
});

describe('DrugAllergyService.searchOne (single CID)', () => {
  it('คืน record ดิบ (ไม่มี HOSPCODE/PID/CID) + นับโควตา', async () => {
    const svc = makeService(new FakeSource(3), 100);
    const r = await svc.searchOne({ cid: '1111111111111', clientKey: '10670' });
    expect(r.count).toBe(3);
    expect(r.quota.used).toBe(3);
    const row = r.records[0]!;
    expect(row).not.toHaveProperty('HOSPCODE');
    expect(row).not.toHaveProperty('PID');
    expect(row).not.toHaveProperty('CID');
    expect(row).toHaveProperty('DNAME');
    expect(row).toHaveProperty('DATERECORD');
  });

  it('cid ว่าง → 400', async () => {
    const svc = makeService(new FakeSource(3));
    await expect(svc.searchOne({ cid: '  ', clientKey: '10670' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('ใช้โควตาร่วมกับ search (นับรวมกัน)', async () => {
    const svc = makeService(new FakeSource(40), 100);
    await svc.searchOne({ cid: '1111111111111', clientKey: '10670' }); // used 40
    const r = await svc.searchOne({ cid: '1111111111111', clientKey: '10670' });
    expect(r.quota.used).toBe(80);
  });
});

describe('ictQuotaDate / ictNextResetAt (เขต ICT)', () => {
  it('06:00 UTC = 13:00 ICT → วันเดียวกัน', () => {
    expect(ictQuotaDate(new Date('2026-07-15T06:00:00Z'))).toBe('2026-07-15');
  });
  it('18:00 UTC = 01:00 ICT วันถัดไป', () => {
    expect(ictQuotaDate(new Date('2026-07-15T18:00:00Z'))).toBe('2026-07-16');
  });
  it('resetAt = เที่ยงคืน ICT ถัดไป (17:00 UTC)', () => {
    // 15 ก.ค. 06:00 UTC → เที่ยงคืน ICT ถัดไป = 16 ก.ค. 00:00 ICT = 15 ก.ค. 17:00 UTC
    expect(ictNextResetAt(new Date('2026-07-15T06:00:00Z'))).toBe('2026-07-15T17:00:00.000Z');
  });
});
