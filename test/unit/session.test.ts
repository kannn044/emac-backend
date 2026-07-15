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

const ACCESS_TTL = 1800; // 30 นาที
const REFRESH_TTL = 43200; // 12 ชม.

function makeSvc(clock: Clock, secret = 's3cret') {
  return new SessionService(secret, ACCESS_TTL, REFRESH_TTL, clock);
}

describe('SessionService — access token (P2-1)', () => {
  it('issues access + refresh, verifies access → AuthContext', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = makeSvc(clock);
    const s = svc.issue(info, 'key-abc');
    expect(s.token).toBeTruthy();
    expect(s.refreshToken).toBeTruthy();
    expect(s.token).not.toBe(s.refreshToken);
    const ctx = svc.verify(s.token);
    expect(ctx).toEqual({
      providerId: 'prov-1',
      hospcode: '10670',
      hospitalName: 'รพ.ทดสอบ',
      role: 'pharmacist',
      name: 'ภญ. ทดสอบ',
      keyId: 'key-abc',
    });
  });

  it('access token หมดอายุใน 30 นาที', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = makeSvc(clock);
    const { token } = svc.issue(info, 'key-abc');
    clock.advance(ACCESS_TTL - 5);
    expect(() => svc.verify(token)).not.toThrow(); // ยังไม่หมด
    clock.advance(10);
    try {
      svc.verify(token);
      expect.unreachable('should throw');
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects token signed with a different secret', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const good = makeSvc(clock, 'secret-a');
    const bad = makeSvc(clock, 'secret-b');
    const { token } = good.issue(info, 'key-abc');
    expect(() => bad.verify(token)).toThrow();
  });

  it('ใช้ refresh token เรียก API (verify) ไม่ได้', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = makeSvc(clock);
    const { refreshToken } = svc.issue(info, 'key-abc');
    expect(() => svc.verify(refreshToken)).toThrow();
  });
});

describe('SessionService — refresh (30 นาที / 12 ชม.)', () => {
  it('refresh ออก access token ใหม่ ใช้งานได้', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = makeSvc(clock);
    const first = svc.issue(info, 'key-abc');

    clock.advance(ACCESS_TTL + 60); // access เดิมหมดแล้ว
    expect(() => svc.verify(first.token)).toThrow();

    const next = svc.refresh(first.refreshToken);
    const ctx = svc.verify(next.token); // access ใหม่ใช้ได้
    expect(ctx.providerId).toBe('prov-1');
    expect(ctx.keyId).toBe('key-abc');
  });

  it('เพดาน session คงที่ (refresh ไม่ยืดเกิน login + 12 ชม.)', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = makeSvc(clock);
    const first = svc.issue(info, 'key-abc');
    const cap = first.refreshExpiresAt;

    clock.advance(3600); // ผ่านไป 1 ชม.
    const next = svc.refresh(first.refreshToken);
    expect(next.refreshExpiresAt).toBe(cap); // เพดานเท่าเดิม ไม่ยืด
  });

  it('access token ที่ refresh ใกล้เพดาน ไม่ล้ำ 12 ชม.', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = makeSvc(clock);
    const first = svc.issue(info, 'key-abc');

    // เหลือเวลาถึงเพดานอีก 10 นาที (< accessTtl 30 นาที)
    clock.advance(REFRESH_TTL - 600);
    const next = svc.refresh(first.refreshToken);
    const accessExpMs = new Date(next.expiresAt).getTime();
    const capMs = new Date(next.refreshExpiresAt).getTime();
    expect(accessExpMs).toBeLessThanOrEqual(capMs); // access ไม่เกินเพดาน
  });

  it('เกิน 12 ชม. → refresh ไม่ได้ (401 ต้อง login ใหม่)', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = makeSvc(clock);
    const first = svc.issue(info, 'key-abc');

    clock.advance(REFRESH_TTL + 60); // เกินเพดาน
    try {
      svc.refresh(first.refreshToken);
      expect.unreachable('should throw');
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('UNAUTHORIZED');
    }
  });

  it('ใช้ access token มา refresh ไม่ได้', () => {
    const clock = new MovableClock(new Date('2026-07-01T00:00:00Z'));
    const svc = makeSvc(clock);
    const first = svc.issue(info, 'key-abc');
    expect(() => svc.refresh(first.token)).toThrow();
  });
});
