/**
 * OAuth state สำหรับ third-party broker flow
 *
 * ปัญหา: GET /auth/callback (redirect_uri เดียวที่ลงทะเบียนกับ Provider ID) ต้องรู้ว่า
 * จะเด้ง code กลับไปที่ไหน — emac frontend (default) หรือแอปของ third party
 *
 * วิธี: ตอน /auth/login?redirect_to=... เราห่อ state เป็น "payload.signature"
 *   payload   = base64url(JSON{ v, r: redirect_to, s: partner state, exp })
 *   signature = base64url(HMAC-SHA256(payload, secret))
 * ตอน callback: verify signature + exp → ได้ redirect_to ที่เชื่อถือได้ (ปลอมไม่ได้
 * เพราะไม่มี secret) แล้วส่ง code + state เดิมของ partner กลับให้เขา
 *
 * state ที่ไม่ใช่รูปแบบนี้ (เช่น uuid จาก emac frontend) → unwrapState คืน null
 * แล้ว callback ใช้ default frontendCallbackUrl ตามเดิม
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WrappedState {
  redirectTo: string;
  /** state เดิมที่ third party ส่งมา (ส่งกลับให้เขาตรวจ CSRF เอง) */
  partnerState?: string;
}

interface StatePayload {
  v: 1;
  r: string;
  s?: string;
  exp: number; // epoch seconds
}

const DEFAULT_TTL_SECONDS = 600; // 10 นาที — พอสำหรับ user กด login

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** ห่อ redirect_to + partner state เป็น signed state string */
export function wrapState(
  secret: string,
  input: WrappedState & { ttlSeconds?: number; now?: Date },
): string {
  const nowMs = input.now?.getTime() ?? Date.now();
  const payload: StatePayload = {
    v: 1,
    r: input.redirectTo,
    ...(input.partnerState ? { s: input.partnerState } : {}),
    exp: Math.floor(nowMs / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

/** แกะ + verify state — คืน null ถ้าไม่ใช่ wrapped state / signature ผิด / หมดอายุ */
export function unwrapState(
  secret: string,
  state: string,
  now: Date = new Date(),
): WrappedState | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const body = parts[0]!;
  const sig = parts[1]!;

  const expected = sign(secret, body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  } catch {
    return null;
  }
  if (payload.v !== 1 || typeof payload.r !== 'string' || !payload.r) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(now.getTime() / 1000)) {
    return null;
  }
  return {
    redirectTo: payload.r,
    ...(typeof payload.s === 'string' && payload.s ? { partnerState: payload.s } : {}),
  };
}

/**
 * ตรวจ redirect_to กับ allowlist (env THIRD_PARTY_REDIRECT_ALLOWLIST)
 *
 * รูปแบบ entry:
 *   https://his-a.hospital.go.th          → อนุญาตทุก path ใน origin นี้
 *   https://his-b.go.th/emac/callback     → อนุญาต URL นี้ (และ query ใด ๆ)
 * บังคับ https ยกเว้น localhost/127.0.0.1 (สำหรับ dev)
 */
export function isAllowedRedirect(target: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocal) return false;

  return allowlist.some((raw) => {
    let entry: URL;
    try {
      entry = new URL(raw.trim());
    } catch {
      return false;
    }
    if (entry.origin !== url.origin) return false;
    // entry เป็น origin ล้วน (path = /) → อนุญาตทุก path
    if (entry.pathname === '/' && !entry.search) return true;
    // entry ระบุ path → ต้องตรง path เป๊ะ (query ของ target เป็นอะไรก็ได้)
    return url.pathname === entry.pathname;
  });
}
