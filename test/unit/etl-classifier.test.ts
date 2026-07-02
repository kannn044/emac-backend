import { describe, it, expect } from 'vitest';
import { classifyDrug } from '@/modules/etl/classifier';

describe('classifyDrug (P1-4)', () => {
  it('classifies NSAID as systemic by default', () => {
    const c = classifyDrug('IBUPROFEN 400 MG TABLET');
    expect(c.bucket).toBe('nsaid');
    expect(c.group).toBe('Ibuprofen');
    expect(c.systemic).toBe(true);
  });

  it('marks topical NSAID as non-systemic', () => {
    const c = classifyDrug('DICLOFENAC GEL TOPICAL');
    expect(c.bucket).toBe('nsaid');
    expect(c.systemic).toBe(false);
  });

  it('classifies antibiotics by group', () => {
    expect(classifyDrug('AMOXICILLIN 500 MG CAPSULE').group).toBe('Penicillins');
    expect(classifyDrug('CIPROFLOXACIN 500 MG').group).toBe('Fluoroquinolones');
    expect(classifyDrug('COTRIMOXAZOLE TABLET').group).toBe('Sulfonamides');
  });

  it('classifies high-risk SJS/TEN drugs', () => {
    expect(classifyDrug('ALLOPURINOL 100 MG TABLET').group).toBe('Allopurinol');
    expect(classifyDrug('CARBAMAZEPINE 200 MG TABLET').group).toBe('Carbamazepine');
  });

  it('returns null group for unknown drug', () => {
    const c = classifyDrug('PARACETAMOL 500 MG TABLET');
    expect(c.group).toBeNull();
    expect(c.bucket).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(classifyDrug('allopurinol 300mg').group).toBe('Allopurinol');
  });
});
