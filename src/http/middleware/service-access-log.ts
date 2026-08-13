/**
 * serviceAccessLog — บันทึก access log ของ service endpoint (/drugallergy/lookup) ทุกผลลัพธ์
 *
 * วางเป็น middleware ตัวแรกของ route → hook res.on('finish') เพื่อจับ **ทุกผลลัพธ์**
 * รวมถึงที่ถูกปฏิเสธโดย serviceAuth (401/403/503) ที่ handler ไม่ทันทำงาน
 *
 * - cid อ่านจาก req.body.cid (express.json parse ก่อน router แล้ว)
 * - resultCount อ่านจาก res.locals.resultCount (handler เซ็ตตอนสำเร็จ)
 * - apiKeyId อ่านจาก req.serviceApiKeyId (serviceAuth เซ็ตเมื่อผ่าน)
 * - best-effort: เขียน log ล้มเหลวไม่ทำให้ request พัง (warn เฉย ๆ)
 */
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '@/core/logger';
import type { ServiceAccessLogRepository } from '@/modules/drugallergy/ports';
import { resolveClientIp } from './service-auth';

declare module 'express-serve-static-core' {
  interface Locals {
    resultCount?: number;
  }
}

export function serviceAccessLog(deps: {
  repo: ServiceAccessLogRepository;
  channel: 'search' | 'lookup';
  clientIpHeader: string;
  logger?: Logger;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      const cidRaw = (req.body as { cid?: unknown } | undefined)?.cid;
      const cid = typeof cidRaw === 'string' ? cidRaw.trim() || null : null;
      void deps.repo
        .record({
          channel: deps.channel,
          // search: จาก session (req.ctx เซ็ตโดย authRequired เมื่อผ่าน)
          providerId: req.ctx?.providerId ?? null,
          hospcode: req.ctx?.hospcode ?? null,
          // lookup: จาก IP + API key fingerprint
          clientIp: resolveClientIp(req, deps.clientIpHeader) || null,
          apiKeyId: req.serviceApiKeyId ?? null,
          cid,
          resultCount: res.locals.resultCount ?? 0,
          status: res.statusCode,
          requestId: (req as { id?: string }).id ?? null,
        })
        .catch((err) => {
          deps.logger?.warn({ err }, 'access log write failed');
        });
    });
    next();
  };
}
