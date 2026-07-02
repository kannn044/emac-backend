import { describe, it, expect } from 'vitest';
import {
  computeNaturalKey,
  normalizeDiagcode,
  toDateOnly,
} from '@/modules/etl/normalize';

describe('normalizeDiagcode (P1-1)', () => {
  it('maps SJS/TEN variants', () => {
    expect(normalizeDiagcode('L511')).toBe('L511');
    expect(normalizeDiagcode('L512')).toBe('L512');
    expect(normalizeDiagcode('L519')).toBe('L519');
  });
  it('maps other L51 codes to unspecified L519', () => {
    expect(normalizeDiagcode('L51')).toBe('L519');
    expect(normalizeDiagcode('L510')).toBe('L519');
    expect(normalizeDiagcode('L51.1')).toBe('L511'); // ทน dot
  });
  it('returns null for non-L51 codes', () => {
    expect(normalizeDiagcode('A099')).toBeNull();
    expect(normalizeDiagcode('L50')).toBeNull();
  });
});

describe('computeNaturalKey', () => {
  it('is stable for same inputs (idempotent)', () => {
    const a = computeNaturalKey({
      hospcode: '10670',
      pid: 'P001',
      datetimeAdmit: '2026-05-20',
      diagcode: 'L511',
    });
    const b = computeNaturalKey({
      hospcode: '10670',
      pid: 'P001',
      datetimeAdmit: '2026-05-20',
      diagcode: 'L511',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex
  });
  it('differs when any component changes', () => {
    const base = {
      hospcode: '10670',
      pid: 'P001',
      datetimeAdmit: '2026-05-20',
      diagcode: 'L511',
    };
    expect(computeNaturalKey(base)).not.toBe(
      computeNaturalKey({ ...base, diagcode: 'L512' }),
    );
  });
});

describe('toDateOnly', () => {
  it('handles Date and string', () => {
    expect(toDateOnly('2026-05-20')).toBe('2026-05-20');
    expect(toDateOnly(new Date('2026-05-20T10:00:00Z'))).toBe('2026-05-20');
  });
  it('throws on invalid date', () => {
    expect(() => toDateOnly('not-a-date')).toThrow();
  });
});
