import { describe, it, expect } from 'vitest';
import { SessionService } from '@/modules/auth/session.service';
import type { ProviderInfo } from '@/modules/auth/types';
import { isAppError } from '@/core/errors';
import type { Clock } from '@/ports/index';

const info: ProviderInfo = {
  providerId: 'prov-1',
  name: 'ภญ. ทดสอบ',
  position: 'เภสัชกร',
  license: 'PH-1',
  hospcode: '10670',
  hospitalName: 'รพ.ทดสอบ',
  role: 'pharmacist',
  isMedicalPersonnel: true,
};

/** clock ที่เลื่อนเวลาได้เพื่อทดสอบ token หมดอายุ */
class MovableClock implements Clock {
  constructor(private t: Date) {}
  now(): Date {
    return this.t;
  }
  advance(seconds: number): void {
    this.t = new Date(this.t.getTime() + seconds * 1000);
  }
}

describe('SessionService — P2-1', () => {
  it('issues a session and verifies it back to AuthContext', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = new SessionService('s3cret', 900, clock);
    const { token } = svc.issue(info, 'key-abc');
    const ctx = svc.verify(token);
    expect(ctx).toEqual({
      providerId: 'prov-1',
      hospcode: '10670',
      hospitalName: 'รพ.ทดสอบ',
      role: 'pharmacist',
      name: 'ภญ. ทดสอบ',
      keyId: 'key-abc',
    });
  });

  it('P2-1: rejects an expired session', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = new SessionService('s3cret', 900, clock);
    const { token } = svc.issue(info, 'key-abc');
    clock.advance(901);
    try {
      svc.verify(token);
      expect.unreachable('should throw');
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('UNAUTHORIZED');
    }
  });

  it('P2-1: rejects a token signed with a different secret', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const good = new SessionService('secret-a', 900, clock);
    const bad = new SessionService('secret-b', 900, clock);
    const { token } = good.issue(info, 'key-abc');
    expect(() => bad.verify(token)).toThrow();
  });
});
