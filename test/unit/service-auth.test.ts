/**
 * serviceAuth middleware — IP allowlist + API key
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { serviceAuth, resolveClientIp } from '@/http/middleware/service-auth';
import { isAppError } from '@/core/errors';

const CFG = {
  apiKeys: ['secret-key-1', 'secret-key-2'],
  allowlistIps: ['203.0.113.5', '203.0.113.6'],
  clientIpHeader: 'cf-connecting-ip',
};

function fakeReq(headers: Record<string, string>): Request {
  const h: Record<string, string> = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    headers: h,
    header: (name: string) => h[name.toLowerCase()],
    ip: '10.0.0.1',
  } as unknown as Request;
}

function run(cfg: typeof CFG, headers: Record<string, string>): { err: unknown; passed: boolean } {
  const mw = serviceAuth(cfg);
  let err: unknown = null;
  let passed = false;
  mw(fakeReq(headers), {} as Response, (e?: unknown) => {
    if (e) err = e;
    else passed = true;
  });
  return { err, passed };
}

describe('resolveClientIp', () => {
  it('อ่านจาก cf-connecting-ip', () => {
    expect(resolveClientIp(fakeReq({ 'cf-connecting-ip': '203.0.113.5' }), 'cf-connecting-ip')).toBe('203.0.113.5');
  });
  it('เอา IP ตัวแรกถ้าเป็น list', () => {
    expect(resolveClientIp(fakeReq({ 'cf-connecting-ip': '203.0.113.5, 70.0.0.1' }), 'cf-connecting-ip')).toBe('203.0.113.5');
  });
  it('fallback req.ip ถ้าไม่มี header', () => {
    expect(resolveClientIp(fakeReq({}), 'cf-connecting-ip')).toBe('10.0.0.1');
  });
});

describe('serviceAuth', () => {
  it('ผ่านเมื่อ IP + API key ถูกต้อง', () => {
    const { err, passed } = run(CFG, { 'cf-connecting-ip': '203.0.113.5', 'x-api-key': 'secret-key-1' });
    expect(passed).toBe(true);
    expect(err).toBeNull();
  });

  it('รับหลาย API key (rotate)', () => {
    const { passed } = run(CFG, { 'cf-connecting-ip': '203.0.113.6', 'x-api-key': 'secret-key-2' });
    expect(passed).toBe(true);
  });

  it('IP นอก allowlist → 403', () => {
    const { err } = run(CFG, { 'cf-connecting-ip': '8.8.8.8', 'x-api-key': 'secret-key-1' });
    expect(isAppError(err) && err.code).toBe('FORBIDDEN');
  });

  it('API key ผิด → 401', () => {
    const { err } = run(CFG, { 'cf-connecting-ip': '203.0.113.5', 'x-api-key': 'wrong' });
    expect(isAppError(err) && err.code).toBe('UNAUTHORIZED');
  });

  it('ไม่มี API key → 401', () => {
    const { err } = run(CFG, { 'cf-connecting-ip': '203.0.113.5' });
    expect(isAppError(err) && err.code).toBe('UNAUTHORIZED');
  });

  it('ไม่ตั้งค่า (apiKeys/allowlistIps ว่าง) → 503 ปิด endpoint', () => {
    const { err } = run({ ...CFG, apiKeys: [], allowlistIps: [] }, { 'cf-connecting-ip': '203.0.113.5', 'x-api-key': 'x' });
    expect(isAppError(err) && err.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('ตั้งแค่ API key แต่ไม่ตั้ง IP → ปิด (503)', () => {
    const { err } = run({ ...CFG, allowlistIps: [] }, { 'cf-connecting-ip': '203.0.113.5', 'x-api-key': 'secret-key-1' });
    expect(isAppError(err) && err.code).toBe('SERVICE_UNAVAILABLE');
  });
});
