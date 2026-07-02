/**
 * JWT (HS256) แบบ minimal — เซ็น/ตรวจ session token ของระบบเราเอง
 *
 * ทำเองด้วย node:crypto (ไม่พึ่ง lib ภายนอก) เพื่อคุม dependency ให้น้อย
 * ใช้เฉพาะ session ภายใน (ของเรา ↔ ของเรา) — ส่วนตรวจ id_token ของ MOPH (JWKS/RS256)
 * เป็นหน้าที่ของ AuthProvider adapter ตอนสลับเป็น real
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function sign(data: string, secret: string): string {
  return b64urlEncode(createHmac('sha256', secret).update(data).digest());
}

/** payload = claims ทั้งหมด (รวม iat/exp ที่ผู้เรียกใส่มาเอง) */
export function signJwt(payload: object, secret: string): string {
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlEncode(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

/**
 * ตรวจลายเซ็น + decode payload (ไม่เช็ค exp ที่นี่ — ให้ caller เทียบกับ clock เอง)
 * ผิด → โยน AppError.unauthorized
 */
export function verifyJwt(token: string, secret: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw AppError.unauthorized('Malformed token');
  }
  const [header, body, signature] = parts as [string, string, string];
  const expected = sign(`${header}.${body}`, secret);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw AppError.unauthorized('Invalid token signature');
  }

  try {
    return JSON.parse(b64urlDecode(body).toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw AppError.unauthorized('Invalid token payload');
  }
}
