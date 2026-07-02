/**
 * Auth routes (P2)
 *   GET  /auth/providers  — (mock) รายชื่อโปรไฟล์ให้ frontend เลือก login
 *   POST /auth/session    — (mock) login ด้วย providerId → session JWT
 *   GET  /auth/me         — (protected) identity ปัจจุบันจาก session
 *
 * real OIDC (GET /auth/login → redirect, GET /auth/callback → exchange code)
 * จะเพิ่มตอนสลับ AUTH_PROVIDER=real โดยใช้ AuthService.login(code) เดิม
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@/core/errors';

/** ห่อ async handler → ส่ง error เข้า error-handler กลาง (Express 4 ไม่ catch เอง) */
function wrap(
  fn: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}
import type { AuthProvider } from '@/modules/auth/ports';
import type { AuthService } from '@/modules/auth/auth.service';
import type { SessionService } from '@/modules/auth/session.service';
import { authRequired } from '../middleware/auth';

const LoginBody = z.object({
  providerId: z.string().min(1, 'providerId is required'),
});

export function authRouter(deps: {
  provider: AuthProvider;
  authService: AuthService;
  sessions: SessionService;
}): Router {
  const router = Router();

  router.get('/auth/providers', (_req, res) => {
    // เปิดเฉพาะ mock (dev) — real ไม่เปิดเผยรายชื่อ provider
    if (deps.provider.kind !== 'mock') {
      throw AppError.notFound('Not available');
    }
    res.json({ providers: deps.provider.listMockProfiles() });
  });

  router.post(
    '/auth/session',
    wrap(async (req, res) => {
      if (deps.provider.kind !== 'mock') {
        // real: ต้องผ่าน /auth/login → /auth/callback (OIDC) แทน
        throw AppError.badRequest('Mock login disabled; use OIDC flow');
      }
      const parsed = LoginBody.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid body', parsed.error.flatten());
      }
      const result = await deps.authService.login(parsed.data.providerId);
      res.status(201).json({
        token: result.session.token,
        expiresAt: result.session.expiresAt,
        profile: result.profile,
      });
    }),
  );

  router.get('/auth/me', authRequired(deps.sessions), (req, res) => {
    // req.ctx ถูกเซ็ตโดย authRequired เสมอเมื่อผ่าน
    res.json({ identity: req.ctx });
  });

  return router;
}
