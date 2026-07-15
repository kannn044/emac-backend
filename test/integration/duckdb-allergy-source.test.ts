/**
 * DuckDbAllergySource — integration กับไฟล์ parquet ตัวอย่างจริง
 * (docs/samples/drugallergy_2026_96.parquet) — ตรวจว่า query + map ถูกต้อง
 *
 * ข้าม test นี้อัตโนมัติถ้าไม่มีไฟล์ตัวอย่าง (เช่นบน CI ที่ไม่ commit parquet)
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DuckDbAllergySource } from '@/adapters/parquet/duckdb-allergy-source';

const SAMPLE = resolve(__dirname, '../../docs/samples/drugallergy_2026_96.parquet');
const GLOB = resolve(__dirname, '../../docs/samples/drugallergy_*.parquet');
const KNOWN_CID = 'REDACTED_CID'; // มีอยู่จริงในไฟล์ตัวอย่าง

const maybe = existsSync(SAMPLE) ? describe : describe.skip;

maybe('DuckDbAllergySource (real parquet)', () => {
  it('query CID ที่มีอยู่ → คืน record ที่ map ครบคอลัมน์', async () => {
    const src = new DuckDbAllergySource(GLOB);
    const rows = await src.queryByCids([KNOWN_CID], 10);
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0]!;
    expect(r.cid).toBe(KNOWN_CID);
    // คอลัมน์ที่ควรมี key ครบ (ค่าอาจเป็น null ได้)
    expect(r).toHaveProperty('dname');
    expect(r).toHaveProperty('symptom');
    expect(r).toHaveProperty('dateRecord');
    expect(typeof r.hospcode).toBe('string');
  }, 30_000);

  it('CID ไม่มีจริง → คืนว่าง', async () => {
    const src = new DuckDbAllergySource(GLOB);
    const rows = await src.queryByCids(['9999999999998'], 10);
    expect(rows).toEqual([]);
  }, 30_000);

  it('เคารพ limit', async () => {
    const src = new DuckDbAllergySource(GLOB);
    const rows = await src.queryByCids([KNOWN_CID], 1);
    expect(rows.length).toBeLessThanOrEqual(1);
  }, 30_000);

  it('queryOneRaw คืนทุกคอลัมน์ยกเว้น HOSPCODE/PID/CID', async () => {
    const src = new DuckDbAllergySource(GLOB);
    const rows = await src.queryOneRaw(KNOWN_CID, 5);
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0]!;
    expect(r).not.toHaveProperty('HOSPCODE');
    expect(r).not.toHaveProperty('PID');
    expect(r).not.toHaveProperty('CID');
    // คอลัมน์อื่นต้องมีครบ (ค่าอาจ null)
    for (const col of ['DATERECORD', 'DRUGALLERGY', 'DNAME', 'TYPEDX', 'ALEVEL', 'SYMPTOM', 'D_UPDATE', 'HDC_DATE']) {
      expect(r).toHaveProperty(col);
    }
    // date ถูก cast เป็น string
    expect(r.DATERECORD === null || typeof r.DATERECORD === 'string').toBe(true);
  }, 30_000);
});
