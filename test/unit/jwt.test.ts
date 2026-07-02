import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '@/core/jwt';
import { isAppError } from '@/core/errors';

describe('jwt (HS256)', () => {
  const secret = 'unit-secret';

  it('signs then verifies round-trip', () => {
    const token = signJwt({ sub: 'p1', role: 'pharmacist' }, secret);
    const payload = verifyJwt(token, secret);
    expect(payload['sub']).toBe('p1');
    expect(payload['role']).toBe('pharmacist');
  });

  it('rejects tampered signature', () => {
    const token = signJwt({ sub: 'p1' }, secret);
    const tampered = `${token}x`;
    try {
      verifyJwt(tampered, secret);
      expect.unreachable('should throw');
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects wrong secret', () => {
    const token = signJwt({ sub: 'p1' }, secret);
    expect(() => verifyJwt(token, 'other-secret')).toThrow();
  });

  it('rejects malformed token', () => {
    expect(() => verifyJwt('not.a.jwt.at.all', secret)).toThrow();
    expect(() => verifyJwt('abc', secret)).toThrow();
  });
});
