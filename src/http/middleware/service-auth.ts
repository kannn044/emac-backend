/**
 * serviceAuth — middleware สำหรับ endpoint M2M (ไม่ผ่าน Provider ID)
 * ยืนยันด้วย 2 ชั้น: (1) client IP อยู่ใน allowlist  (2) X-API-Key ถูกต้อง
 *
 * client IP อ่านจาก header ของ Cloudflare (default cf-connecting-ip) — หลัง Cloudflare
 * ตั้ง header นี้เป็น IP จริงของผู้เรียก · ถ้าไม่มีก็ fallback req.ip (trust proxy)
 *
 * ปิดโดย default: ถ้า apiKeys หรือ allowlistIps ว่าง → 503 (endpoint ไม่เปิด)
 *
 * หมายเหตุความปลอดภัย: ควร enforce IP ที่ nginx/Cloudflare ด้วย (defense in depth)
 * เพราะ header cf-connecting-ip เชื่อได้ต่อเมื่อ origin รับ traffic จาก Cloudflare เท่านั้น
 */
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@/core/errors';

export interface ServiceAuthConfig {
  apiKeys: string[];
  allowlistIps: string[];
  clientIpHeader: string;
}

/** เทียบสตริงแบบ timing-safe (กัน timing attack เดา API key) */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** client IP จาก header ของ Cloudflare (เอาตัวแรกถ้าเป็น list) → fallback req.ip */
export function resolveClientIp(req: Request, headerName: string): string {
  const raw = req.headers[headerName.toLowerCase()];
  const headerVal = Array.isArray(raw) ? raw[0] : raw;
  if (headerVal && headerVal.trim()) {
    return headerVal.split(',')[0]!.trim();
  }
  return (req.ip ?? '').trim();
}

export function serviceAuth(config: ServiceAuthConfig) {
  const enabled = config.apiKeys.length > 0 && config.allowlistIps.length > 0;

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!enabled) {
        throw AppError.unavailable('Service endpoint ยังไม่เปิดใช้งาน (ตั้ง SERVICE_API_KEYS + SERVICE_ALLOWLIST_IPS)');
      }

      // (1) ตรวจ IP
      const ip = resolveClientIp(req, config.clientIpHeader);
      if (!ip || !config.allowlistIps.includes(ip)) {
        throw AppError.forbidden('IP ไม่ได้รับอนุญาต');
      }

      // (2) ตรวจ API key (timing-safe, รองรับหลาย key)
      const key = (req.header('x-api-key') ?? '').trim();
      if (!key || !config.apiKeys.some((k) => safeEqual(k, key))) {
        throw AppError.unauthorized('API key ไม่ถูกต้อง');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
