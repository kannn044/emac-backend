/**
 * PgAllergyQuotaStore — integration กับ Postgres (จำลองด้วย pg-mem)
 * ครอบ SQL จริงของ reserve/peek (path ที่ e2e ใช้ in-memory store ไม่ได้แตะ)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { PgAllergyQuotaStore } from '@/adapters/db/allergy-quota.repository';

function freshStore(): { store: PgAllergyQuotaStore; pool: Pool } {
  const db = newDb();
  db.public.none(`
    CREATE TABLE drugallergy_quota (
      client_key TEXT NOT NULL,
      quota_date DATE NOT NULL,
      used_records INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (client_key, quota_date)
    );
  `);
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as Pool;
  return { store: new PgAllergyQuotaStore(pool), pool };
}

const DATE = '2026-07-15';

describe('PgAllergyQuotaStore (pg-mem)', () => {
  let store: PgAllergyQuotaStore;
  beforeEach(() => {
    store = freshStore().store;
  });

  it('peek = 0 เมื่อยังไม่มีแถว', async () => {
    expect(await store.peek('10670', DATE)).toBe(0);
  });

  it('reserve ครั้งแรก → granted เต็มจำนวน + used สะสม', async () => {
    const a = await store.reserve('10670', DATE, 5, 100);
    expect(a).toEqual({ granted: 5, usedAfter: 5 });
    expect(await store.peek('10670', DATE)).toBe(5);

    const b = await store.reserve('10670', DATE, 40, 100);
    expect(b).toEqual({ granted: 40, usedAfter: 45 });
  });

  it('cap ที่ limit → granted เท่าที่เหลือ', async () => {
    await store.reserve('10670', DATE, 80, 100); // used 80
    const r = await store.reserve('10670', DATE, 50, 100); // เหลือ 20
    expect(r).toEqual({ granted: 20, usedAfter: 100 });

    const none = await store.reserve('10670', DATE, 10, 100); // เต็มแล้ว
    expect(none).toEqual({ granted: 0, usedAfter: 100 });
  });

  it('แยกตาม client_key และ quota_date', async () => {
    await store.reserve('10670', DATE, 30, 100);
    expect((await store.reserve('11292', DATE, 10, 100)).usedAfter).toBe(10); // client อื่น
    expect((await store.reserve('10670', '2026-07-16', 10, 100)).usedAfter).toBe(10); // วันใหม่
  });
});
