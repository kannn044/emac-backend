import { describe, it, expect } from 'vitest';
import { canonicalize } from '@/modules/verification/canonical';

describe('canonicalize', () => {
  it('produces identical output regardless of key order', () => {
    const a = canonicalize({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const b = canonicalize({ c: { x: 2, y: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('changes when any value changes (tamper-evident)', () => {
    const base = canonicalize({ drug: 'Carbamazepine', severity: 'severe' });
    const tampered = canonicalize({ drug: 'Carbamazepine', severity: 'mild' });
    expect(base).not.toBe(tampered);
  });

  it('preserves array order', () => {
    expect(canonicalize({ d: [1, 2, 3] })).not.toBe(canonicalize({ d: [3, 2, 1] }));
  });
});
