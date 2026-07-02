/**
 * Verification routes (P4) — mount ใต้ /api/v1 (auth + role doctor|pharmacist)
 *   POST  /patients/:id/verify         ยืนยัน + ลงนาม → set verified
 *   POST  /patients/:id/reject         ปฏิเสธ → rejected_records
 *   PATCH /patients/:id/note           แก้ note (เฉพาะ pending)
 *   POST  /patients/:id/card/preview   render บัตร (ยังไม่บันทึก)
 *   GET   /keys/:providerId            public key (เปิด — ตรวจลายเซ็นได้เอง)
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@/core/errors';
import type { SessionService } from '@/modules/auth/session.service';
import type { KeyService } from '@/modules/auth/ports';
import type { VerificationService } from '@/modules/verification/verification.service';
import type { CardService } from '@/modules/cards/cards.service';
import { SEVERITIES, ASSESSMENT_CODES } from '@/modules/verification/types';
import { authRequired, requireRole } from '../middleware/auth';

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

const ConfirmedDrug = z.object({
  didstd: z.string().min(1),
  dname: z.string().min(1),
  group: z.string().nullable().default(null),
  adverseReaction: z.string().trim().max(500).optional(),
  assessment: z.enum(ASSESSMENT_CODES as unknown as [string, ...string[]]).default('1'),
});

const VerifyBody = z.object({
  confirmedDrugs: z.array(ConfirmedDrug).min(1, 'ต้องเลือกยาอย่างน้อย 1 รายการ'),
  biomarker: z.string().trim().max(128).optional(),
  severity: z.enum(SEVERITIES as unknown as [string, ...string[]]),
  manifestations: z.array(z.string().trim().min(1)).default([]),
  crossReactiveDrugs: z.array(z.string().trim().min(1)).default([]),
  alternativeDrugs: z.array(z.string().trim().min(1)).default([]),
  note: z.string().trim().max(2000).optional(),
});

const RejectBody = z.object({
  reason: z.string().trim().min(1, 'ต้องระบุเหตุผล').max(2000),
});

const NoteBody = z.object({
  note: z.string().trim().max(2000),
});

function parseId(req: Request): string {
  const id = req.params.id;
  if (!id) throw AppError.badRequest('Missing patient id');
  return id;
}

/** public: ดึง public key ไปตรวจลายเซ็นเอง (ไม่ต้อง login) — mount ก่อน router ที่บังคับ auth */
export function keysRouter(deps: { keys: KeyService }): Router {
  const router = Router();
  router.get(
    '/keys/:providerId',
    wrap(async (req, res) => {
      const pid = req.params.providerId;
      if (!pid) throw AppError.badRequest('Missing providerId');
      const pem = await deps.keys.getPublicKeyPem(pid);
      if (!pem) throw AppError.notFound('ไม่พบ public key');
      res.json({ providerId: pid, algorithm: 'Ed25519', publicKeyPem: pem });
    }),
  );
  return router;
}

export function verificationRouter(deps: {
  sessions: SessionService;
  verification: VerificationService;
  cards: CardService;
}): Router {
  const router = Router();

  // ทุก route ใต้นี้ต้อง login + role
  router.use(authRequired(deps.sessions), requireRole('doctor', 'pharmacist'));

  router.post(
    '/patients/:id/verify',
    wrap(async (req, res) => {
      const parsed = VerifyBody.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid body', parsed.error.flatten());
      }
      const result = await deps.verification.verify(
        req.ctx!,
        parseId(req),
        parsed.data as never,
        req.id,
      );
      res.status(201).json({
        verification: result.verification,
        card: deps.cards.links(result.card),
      });
    }),
  );

  router.post(
    '/patients/:id/reject',
    wrap(async (req, res) => {
      const parsed = RejectBody.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid body', parsed.error.flatten());
      }
      await deps.verification.reject(
        req.ctx!,
        parseId(req),
        parsed.data.reason,
        req.id,
      );
      res.status(200).json({ status: 'rejected' });
    }),
  );

  router.patch(
    '/patients/:id/note',
    wrap(async (req, res) => {
      const parsed = NoteBody.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid body', parsed.error.flatten());
      }
      await deps.verification.updateNote(
        req.ctx!,
        parseId(req),
        parsed.data.note,
        req.id,
      );
      res.status(200).json({ status: 'ok' });
    }),
  );

  router.post(
    '/patients/:id/card/preview',
    wrap(async (req, res) => {
      const parsed = VerifyBody.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid body', parsed.error.flatten());
      }
      const preview = await deps.verification.previewCard(
        req.ctx!,
        parseId(req),
        parsed.data as never,
      );
      res.json({ preview });
    }),
  );

  return router;
}
