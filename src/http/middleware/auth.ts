/**
 * Auth middleware — ตรวจ session JWT → แนบ req.ctx (AuthContext)
 *   authRequired : ต้องมี Bearer token ที่ valid (ไม่งั้น 401)
 *   requireRole  : จำกัดตาม role (ไม่งั้น 403)
 *
 * tenant scope (hospcode) บังคับที่ repository layer ใน P3 (ห้ามรับ hospcode จาก client)
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@/core/errors';
import type { SessionService } from '@/modules/auth/session.service';
import type { AuthContext, Role } from '@/modules/auth/types';

declare module 'express-serve-static-core' {
  interface Request {
    ctx?: AuthContext;
  }
}

function extractBearer(req: Request): string {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw AppError.unauthorized('Missing bearer token');
  }
  return token;
}

export function authRequired(sessions: SessionService) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.ctx = sessions.verify(extractBearer(req));
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** ต้องเรียกหลัง authRequired (req.ctx ถูกเซ็ตแล้ว) */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.ctx) {
      next(AppError.unauthorized('Not authenticated'));
      return;
    }
    if (!roles.includes(req.ctx.role)) {
      next(AppError.forbidden('บทบาทนี้ไม่มีสิทธิ์ดำเนินการ'));
      return;
    }
    next();
  };
}
