import { describe, it, expect } from 'vitest';
import { aggregateRows } from '@/modules/etl/aggregate';
import { SAMPLE_ROWS } from '../../scripts/gen-mock-parquet';

describe('aggregateRows (P1-1/3/9)', () => {
  it('groups drug-level rows into patient-level records', () => {
    const { records } = aggregateRows(SAMPLE_ROWS);
    // P001 (L511) + P002 (L512) = 2 records; P003 (A099) ถูกข้าม
    expect(records).toHaveLength(2);
  });

  it('skips non-L51 diagnoses (counts invalid)', () => {
    const report = aggregateRows(SAMPLE_ROWS);
    const hasA099 = report.records.some((r) => r.diagcode === 'A099');
    expect(hasA099).toBe(false);
    expect(report.rowsInvalid).toBeGreaterThanOrEqual(1);
  });

  it('dedupes identical drug rows within a patient', () => {
    const { records } = aggregateRows(SAMPLE_ROWS);
    const p001 = records.find((r) => r.pid === 'P001');
    // Allopurinol + Amoxicillin (แถวซ้ำถูกรวม) = 2
    expect(p001?.suspectDrugs).toHaveLength(2);
  });

  it('drops drugs served AFTER admit (guard)', () => {
    const report = aggregateRows(SAMPLE_ROWS);
    const p002 = report.records.find((r) => r.pid === 'P002');
    const names = p002?.suspectDrugs.map((d) => d.dname) ?? [];
    expect(names.some((n) => n.includes('PARACETAMOL'))).toBe(false);
    expect(report.rowsDropped).toBeGreaterThanOrEqual(1);
  });

  it('populates classification group arrays', () => {
    const { records } = aggregateRows(SAMPLE_ROWS);
    const p001 = records.find((r) => r.pid === 'P001');
    expect(p001?.otherGroups).toContain('Allopurinol');
    expect(p001?.antibioticGroups).toContain('Penicillins');

    const p002 = records.find((r) => r.pid === 'P002');
    expect(p002?.otherGroups).toContain('Carbamazepine');
    expect(p002?.nsaidGroups).toContain('Ibuprofen');
    // Ibuprofen เป็น systemic; Diclofenac gel เป็น topical (ไม่อยู่ใน systemic)
    expect(p002?.systemicNsaids).toContain('Ibuprofen');
    expect(p002?.systemicNsaids).not.toContain('Diclofenac');
  });

  it('produces stable natural_key + normalized diagcode', () => {
    const { records } = aggregateRows(SAMPLE_ROWS);
    for (const r of records) {
      expect(r.naturalKey).toHaveLength(64);
      expect(['L511', 'L512', 'L519']).toContain(r.diagcode);
    }
  });
});
