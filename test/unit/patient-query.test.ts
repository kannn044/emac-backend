import { describe, it, expect } from 'vitest';
import { InMemoryPatientQueryRepository } from '@/adapters/memory/patient-query.memory';

const repo = () => new InMemoryPatientQueryRepository();
const q = (over = {}) => ({ page: 1, pageSize: 20, ...over });

describe('InMemoryPatientQueryRepository — tenant scope + filters', () => {
  it('P3-1: lists only records of the given hospcode', async () => {
    const res = await repo().list('10670', q());
    expect(res.items.length).toBeGreaterThan(0);
    // seed มี 10 รายการของ 10670
    expect(res.total).toBe(10);
  });

  it('does not leak other hospcode rows', async () => {
    const a = await repo().list('10670', q({ pageSize: 100 }));
    const b = await repo().list('11292', q({ pageSize: 100 }));
    expect(a.total).toBe(10);
    expect(b.total).toBe(2);
    // ไม่มี id ซ้ำข้าม tenant
    const aIds = new Set(a.items.map((i) => i.id));
    expect(b.items.some((i) => aIds.has(i.id))).toBe(false);
  });

  it('P3-3: filters by status', async () => {
    const pending = await repo().list('10670', q({ status: 'pending' }));
    const verified = await repo().list('10670', q({ status: 'verified' }));
    expect(pending.items.every((i) => i.status === 'pending')).toBe(true);
    expect(verified.total).toBe(1);
  });

  it('P3-3: paginates with correct total', async () => {
    const page1 = await repo().list('10670', q({ pageSize: 2, page: 1 }));
    const page2 = await repo().list('10670', q({ pageSize: 2, page: 2 }));
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(10);
    expect(page1.items[0]!.id).not.toBe(page2.items[0]!.id);
  });

  it('P3-4: filters by diagcode and admit date range', async () => {
    const byDiag = await repo().list('10670', q({ diagcode: 'L511' }));
    expect(byDiag.items.every((i) => i.diagcode === 'L511')).toBe(true);

    const byRange = await repo().list(
      '10670',
      q({ admitFrom: '2026-06-20', admitTo: '2026-06-30' }),
    );
    expect(
      byRange.items.every(
        (i) => i.datetimeAdmit >= '2026-06-20' && i.datetimeAdmit <= '2026-06-30',
      ),
    ).toBe(true);
  });

  it('filters by drug group and searches by HN/PID', async () => {
    const grp = await repo().list('10670', q({ group: 'Carbamazepine' }));
    expect(grp.items.every((i) => i.groups.includes('Carbamazepine'))).toBe(true);

    const byHn = await repo().list('10670', q({ q: 'HN-2026-0002' }));
    expect(byHn.total).toBe(1);
    expect(byHn.items[0]!.hn).toBe('HN-2026-0002');
  });

  it('findById respects tenant (no cross-hospcode leak)', async () => {
    // id 11 เป็นของ 11292
    expect(await repo().findById('10670', '11')).toBeNull();
    const ok = await repo().findById('11292', '11');
    expect(ok?.sourceHospcode).toBe('11292');
    expect(ok?.suspectDrugs.length).toBeGreaterThan(0);
  });
});
