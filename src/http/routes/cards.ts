/**
 * Card routes (P5)
 *   public:
 *     GET /api/v1/cards/:id/verify      ตรวจความแท้ด้วย public key (ไม่ต้อง login)
 *     GET /embed/card/:render_token     HTML บัตร (iframe) + CSP frame-ancestors
 *   auth (tenant):
 *     GET /api/v1/cards/:id             metadata (เฉพาะ รพ. ตน)
 *     GET /api/v1/patients/:id/card     บัตรของ record (ให้ portal ดึงหลัง verify)
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '@/core/errors';
import type { SessionService } from '@/modules/auth/session.service';
import type { CardService } from '@/modules/cards/cards.service';
import { authRequired, requireRole } from '../middleware/auth';

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

/** public: ตรวจความแท้บัตร (mount ก่อน router ที่บังคับ auth) */
export function publicCardsRouter(deps: { cards: CardService }): Router {
  const router = Router();
  router.get(
    '/cards/:id/verify',
    wrap(async (req, res) => {
      const id = req.params.id;
      if (!id) throw AppError.badRequest('Missing card id');
      const result = await deps.cards.verifyCard(id);
      if (!result) throw AppError.notFound('ไม่พบบัตร');
      res.json(result);
    }),
  );
  return router;
}

/** public: HTML บัตรสำหรับ iframe embed */
export function embedRouter(deps: { cards: CardService }): Router {
  const router = Router();
  router.get(
    '/embed/card/:token',
    wrap(async (req, res) => {
      const token = req.params.token;
      if (!token) throw AppError.badRequest('Missing token');
      const card = await deps.cards.getByRenderToken(token);
      if (!card) throw AppError.notFound('ไม่พบบัตร');
      // อนุญาต embed เฉพาะ same-origin (ปรับ allowlist origin ของ รพ. ได้ภายหลัง)
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.type('html').send(deps.cards.renderHtml(card));
    }),
  );
  return router;
}

/** auth + tenant: metadata + บัตรของ record */
export function authCardsRouter(deps: {
  sessions: SessionService;
  cards: CardService;
}): Router {
  const router = Router();
  router.use(authRequired(deps.sessions), requireRole('doctor', 'pharmacist'));

  router.get(
    '/cards/:id',
    wrap(async (req, res) => {
      const id = req.params.id;
      if (!id) throw AppError.badRequest('Missing card id');
      const card = await deps.cards.getById(id);
      if (!card || card.hospcode !== req.ctx!.hospcode) {
        throw AppError.notFound('ไม่พบบัตร');
      }
      res.json({ card, links: deps.cards.links(card) });
    }),
  );

  router.get(
    '/patients/:id/card',
    wrap(async (req, res) => {
      const id = req.params.id;
      if (!id) throw AppError.badRequest('Missing patient id');
      const card = await deps.cards.getByPatient(req.ctx!.hospcode, id);
      if (!card) throw AppError.notFound('ยังไม่มีบัตรสำหรับผู้ป่วยรายนี้');
      res.json({ card, links: deps.cards.links(card) });
    }),
  );

  return router;
}
