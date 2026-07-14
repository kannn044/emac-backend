/**
 * Auth routes (P2)
 *   GET  /auth/providers  — (mock) รายชื่อโปรไฟล์ให้ frontend เลือก login
 *   POST /auth/session    — (mock) login ด้วย providerId → session JWT
 *   GET  /auth/mode       — บอก frontend ว่า backend เป็น mock หรือ real
 *   GET  /auth/login      — (real) redirect ไปหน้า login ของ MOPH Provider ID
 *   GET  /auth/callback   — (real) รับ ?code จาก Provider ID → ส่งต่อ frontend
 *   POST /auth/callback   — (real) แลก code → session JWT ของระบบเรา
 *   GET  /auth/me         — (protected) identity ปัจจุบันจาก session
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
import {
  wrapState,
  unwrapState,
  isAllowedRedirect,
} from '@/modules/auth/oauth-state';
import { authRequired } from '../middleware/auth';

const LoginBody = z.object({
  providerId: z.string().min(1, 'providerId is required'),
});

const CallbackBody = z.object({
  code: z.string().min(1, 'code is required'),
});

export function authRouter(deps: {
  provider: AuthProvider;
  authService: AuthService;
  sessions: SessionService;
  /** URL หน้า callback ฝั่ง frontend — GET /auth/callback redirect ต่อไปที่นี่ (ว่าง = แลก code แล้วตอบ JSON) */
  frontendCallbackUrl?: string;
  /** secret สำหรับเซ็น wrapped state (ใช้ session JWT secret ได้) */
  stateSecret?: string;
  /** allowlist redirect_to ของ third-party broker (ว่าง = ปิดฟีเจอร์) */
  thirdPartyRedirectAllowlist?: string[];
}): Router {
  const router = Router();

  /** ให้ frontend รู้ว่าต้องแสดง mock picker หรือปุ่ม Login with Provider ID */
  router.get('/auth/mode', (_req, res) => {
    res.json({ mode: deps.provider.kind });
  });

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
        // real: ต้องผ่าน /auth/login → /auth/callback (OAuth2) แทน
        throw AppError.badRequest('Mock login disabled; use OAuth flow');
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

  /**
   * เริ่ม OAuth flow — redirect ผู้ใช้ไปหน้า login ของ MOPH Provider ID
   *   ?state=<random>       frontend/partner สร้างและตรวจเองตอน callback (กัน CSRF)
   *   ?redirect_to=<url>    (third-party broker) callback จะเด้ง code ไป URL นี้แทน
   *                         ต้องอยู่ใน THIRD_PARTY_REDIRECT_ALLOWLIST — เราห่อไว้ใน
   *                         state แบบ HMAC-signed (หมดอายุ 10 นาที) ปลอมไม่ได้
   */
  router.get('/auth/login', (req, res) => {
    let state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const redirectTo =
      typeof req.query.redirect_to === 'string' ? req.query.redirect_to : undefined;

    if (redirectTo) {
      if (!deps.stateSecret) {
        throw AppError.internal('stateSecret not configured');
      }
      if (!isAllowedRedirect(redirectTo, deps.thirdPartyRedirectAllowlist ?? [])) {
        throw AppError.badRequest(
          'redirect_to ไม่ได้รับอนุญาต — ติดต่อผู้ดูแลระบบเพื่อลงทะเบียน URL',
        );
      }
      state = wrapState(deps.stateSecret, { redirectTo, partnerState: state });
    }

    const url = deps.provider.buildAuthorizeUrl(state);
    if (!url) {
      throw AppError.notFound('OAuth login not available (mock mode)');
    }
    res.redirect(302, url);
  });

  /**
   * Redirect URI ที่ลงทะเบียนกับ Provider ID (exact match)
   * มี frontendCallbackUrl → ส่ง code/state ต่อให้ frontend จัดการ (SPA)
   * ไม่มี → แลก code เป็น session แล้วตอบ JSON เลย (สะดวกตอนทดสอบ UAT)
   */
  router.get(
    '/auth/callback',
    wrap(async (req, res) => {
      if (deps.provider.kind === 'mock') {
        throw AppError.notFound('OAuth callback not available (mock mode)');
      }
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      const oauthError =
        typeof req.query.error === 'string' ? req.query.error : '';

      // third-party broker: state เป็น wrapped state ที่เราเซ็นไว้ → เด้ง code ไป
      // redirect_to ของ partner (ตรวจ allowlist ซ้ำ เผื่อ allowlist เปลี่ยนระหว่างทาง)
      if (deps.stateSecret && state) {
        const wrapped = unwrapState(deps.stateSecret, state);
        if (wrapped) {
          if (
            !isAllowedRedirect(
              wrapped.redirectTo,
              deps.thirdPartyRedirectAllowlist ?? [],
            )
          ) {
            throw AppError.badRequest('redirect_to ไม่ได้รับอนุญาตแล้ว');
          }
          const target = new URL(wrapped.redirectTo);
          if (code) target.searchParams.set('code', code);
          if (wrapped.partnerState) target.searchParams.set('state', wrapped.partnerState);
          if (oauthError) target.searchParams.set('error', oauthError);
          res.redirect(302, target.toString());
          return;
        }
      }

      if (deps.frontendCallbackUrl) {
        const target = new URL(deps.frontendCallbackUrl);
        if (code) target.searchParams.set('code', code);
        if (state) target.searchParams.set('state', state);
        if (oauthError) target.searchParams.set('error', oauthError);
        res.redirect(302, target.toString());
        return;
      }

      if (!code) {
        throw AppError.badRequest(oauthError || 'Missing ?code');
      }
      const result = await deps.authService.login(code);
      res.status(201).json({
        token: result.session.token,
        expiresAt: result.session.expiresAt,
        profile: result.profile,
      });
    }),
  );

  /** frontend อ่าน ?code จาก URL แล้ว POST มาที่นี่เพื่อแลกเป็น session JWT */
  router.post(
    '/auth/callback',
    wrap(async (req, res) => {
      if (deps.provider.kind === 'mock') {
        throw AppError.badRequest('OAuth callback disabled in mock mode');
      }
      const parsed = CallbackBody.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid body', parsed.error.flatten());
      }
      const result = await deps.authService.login(parsed.data.code);
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
