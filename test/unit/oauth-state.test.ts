/**
 * oauth-state — wrap/unwrap signed state + redirect allowlist
 */
import { describe, it, expect } from 'vitest';
import {
  wrapState,
  unwrapState,
  isAllowedRedirect,
} from '@/modules/auth/oauth-state';

const SECRET = 'test-secret-key';

describe('wrapState / unwrapState', () => {
  it('roundtrip: ได้ redirectTo + partnerState เดิมกลับมา', () => {
    const state = wrapState(SECRET, {
      redirectTo: 'https://his-a.hospital.go.th/callback',
      partnerState: 'partner-xyz',
    });
    const out = unwrapState(SECRET, state);
    expect(out).toEqual({
      redirectTo: 'https://his-a.hospital.go.th/callback',
      partnerState: 'partner-xyz',
    });
  });

  it('ไม่มี partnerState ก็ทำงานได้', () => {
    const state = wrapState(SECRET, { redirectTo: 'https://a.go.th/cb' });
    expect(unwrapState(SECRET, state)).toEqual({ redirectTo: 'https://a.go.th/cb' });
  });

  it('signature ถูกแก้ → null', () => {
    const state = wrapState(SECRET, { redirectTo: 'https://a.go.th/cb' });
    const [body] = state.split('.');
    expect(unwrapState(SECRET, `${body}.AAAAtampered`)).toBeNull();
  });

  it('payload ถูกแก้ (เปลี่ยน redirect) → null', () => {
    const state = wrapState(SECRET, { redirectTo: 'https://a.go.th/cb' });
    const [, sig] = state.split('.');
    const evil = Buffer.from(
      JSON.stringify({ v: 1, r: 'https://evil.example', exp: 9999999999 }),
    ).toString('base64url');
    expect(unwrapState(SECRET, `${evil}.${sig}`)).toBeNull();
  });

  it('secret คนละตัว → null', () => {
    const state = wrapState(SECRET, { redirectTo: 'https://a.go.th/cb' });
    expect(unwrapState('other-secret', state)).toBeNull();
  });

  it('หมดอายุ → null', () => {
    const state = wrapState(SECRET, {
      redirectTo: 'https://a.go.th/cb',
      ttlSeconds: 60,
      now: new Date('2026-07-14T00:00:00Z'),
    });
    expect(unwrapState(SECRET, state, new Date('2026-07-14T00:02:00Z'))).toBeNull();
    expect(unwrapState(SECRET, state, new Date('2026-07-14T00:00:30Z'))).not.toBeNull();
  });

  it('state ธรรมดา (uuid ของ emac frontend) → null (ไม่ใช่ wrapped)', () => {
    expect(unwrapState(SECRET, 'b3ab1cde-1111-2222-3333-444455556666')).toBeNull();
    expect(unwrapState(SECRET, 'insomnia-test')).toBeNull();
  });
});

describe('isAllowedRedirect', () => {
  const ALLOW = [
    'https://his-a.hospital.go.th',
    'https://his-b.go.th/emac/callback',
    'http://localhost:5173',
  ];

  it('origin entry → อนุญาตทุก path ใน origin นั้น', () => {
    expect(isAllowedRedirect('https://his-a.hospital.go.th/any/path', ALLOW)).toBe(true);
    expect(isAllowedRedirect('https://his-a.hospital.go.th/', ALLOW)).toBe(true);
  });

  it('URL เต็ม → path ต้องตรงเป๊ะ', () => {
    expect(isAllowedRedirect('https://his-b.go.th/emac/callback', ALLOW)).toBe(true);
    expect(isAllowedRedirect('https://his-b.go.th/emac/callback?x=1', ALLOW)).toBe(true);
    expect(isAllowedRedirect('https://his-b.go.th/other', ALLOW)).toBe(false);
  });

  it('origin ไม่อยู่ใน allowlist → ปฏิเสธ', () => {
    expect(isAllowedRedirect('https://evil.example/callback', ALLOW)).toBe(false);
    // subdomain ไม่นับเป็น origin เดียวกัน
    expect(isAllowedRedirect('https://evil.his-a.hospital.go.th/x', ALLOW)).toBe(false);
  });

  it('http ถูกปฏิเสธ ยกเว้น localhost', () => {
    expect(isAllowedRedirect('http://localhost:5173/cb', ALLOW)).toBe(true);
    expect(isAllowedRedirect('http://his-a.hospital.go.th/x', ALLOW)).toBe(false);
  });

  it('allowlist ว่าง = ปิดฟีเจอร์', () => {
    expect(isAllowedRedirect('https://his-a.hospital.go.th/x', [])).toBe(false);
  });

  it('ค่าที่ไม่ใช่ URL → ปฏิเสธ', () => {
    expect(isAllowedRedirect('javascript:alert(1)', ALLOW)).toBe(false);
    expect(isAllowedRedirect('not-a-url', ALLOW)).toBe(false);
  });
});
