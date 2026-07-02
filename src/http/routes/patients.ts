/**
 * Patient routes (P3) — mount ใต้ /api/v1 (ทุก route ต้อง auth + role doctor|pharmacist)
 *   GET /api/v1/patients       list (tenant-scoped, filter/paging/search)
 *   GET /api/v1/patients/:id   detail + suspect drugs (+ audit VIEW)
 *
 * tenant (hospcode) มาจาก req.ctx เท่านั้น — query ที่ส่ง hospcode มาจะถูกเพิกเฉย
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@/core/errors';
import type { SessionService } from '@/modules/auth/session.service';
import type { PatientsService } from '@/modules/patients/patients.service';
import { authRequired, requireRole } from '../middleware/auth';

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

const ListQuery = z.object({
  status: z.enum(['pending', 'verified', 'rejected']).optional(),
  q: z.string().trim().min(1).max(64).optional(),
  diagcode: z.string().trim().max(16).optional(),
  admitFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  admitTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  group: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export function patientsRouter(deps: {
  sessions: SessionService;
  patients: PatientsService;
}): Router {
  const router = Router();

  // ทุก route ใต้นี้ต้อง login + เป็น doctor/pharmacist
  router.use(authRequired(deps.sessions), requireRole('doctor', 'pharmacist'));

  router.get(
    '/patients',
    wrap(async (req, res) => {
      const parsed = ListQuery.safeParse(req.query);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid query', parsed.error.flatten());
      }
      // req.ctx ถูกเซ็ตโดย authRequired เสมอ
      const result = await deps.patients.list(req.ctx!, parsed.data);
      res.json(result);
    }),
  );

  router.get(
    '/patients/:id',
    wrap(async (req, res) => {
      const id = req.params.id;
      if (!id) throw AppError.badRequest('Missing patient id');
      const detail = await deps.patients.getDetail(req.ctx!, id, req.id);
      res.json({ patient: detail });
    }),
  );

  return router;
}
