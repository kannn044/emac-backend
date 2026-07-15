/**
 * Drug allergy history route
 *   POST /api/v1/drugallergy/search — ค้นประวัติแพ้ยาตาม CID เดียว
 *     body: { "cid": "..." }
 *     คืนทุกคอลัมน์ใน parquet ยกเว้น HOSPCODE, PID, CID
 *
 * auth: session Bearer (third-party HIS ที่ authen ผ่าน Provider ID broker)
 * quota: 10000 record/วัน ต่อ client (= hospcode ของ session) — reset เที่ยงคืน ICT
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@/core/errors';
import type { SessionService } from '@/modules/auth/session.service';
import type { DrugAllergyService } from '@/modules/drugallergy/drugallergy.service';
import { authRequired } from '../middleware/auth';

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

const SearchOneBody = z.object({
  cid: z.string().min(1, 'ต้องส่ง cid'),
});

export function drugAllergyRouter(deps: {
  sessions: SessionService;
  service: DrugAllergyService;
}): Router {
  const router = Router();

  // ค้นตาม CID เดียว — คืนทุกคอลัมน์ยกเว้น HOSPCODE, PID, CID
  router.post(
    '/drugallergy/search',
    authRequired(deps.sessions),
    wrap(async (req, res) => {
      const parsed = SearchOneBody.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid body', parsed.error.flatten());
      }
      // client = hospcode ของผู้เรียก (req.ctx เซ็ตโดย authRequired เสมอ)
      const result = await deps.service.searchOne({
        cid: parsed.data.cid,
        clientKey: req.ctx!.hospcode,
      });
      res.json(result);
    }),
  );

  // -------------------------------------------------------------------------
  // (ยังไม่เปิดใช้) multi-CID — ส่ง cids เป็น array คืน record หลายคอลัมน์
  // เปิดใช้ภายหลังโดย uncomment + เปลี่ยน path (เลี่ยงชนกับ single-CID ด้านบน)
  // -------------------------------------------------------------------------
  // const SearchBody = z.object({
  //   cids: z.array(z.string()).min(1, 'ต้องส่ง cids อย่างน้อย 1 รายการ'),
  // });
  //
  // router.post(
  //   '/drugallergy/search-multi',
  //   authRequired(deps.sessions),
  //   wrap(async (req, res) => {
  //     const parsed = SearchBody.safeParse(req.body);
  //     if (!parsed.success) {
  //       throw AppError.badRequest('Invalid body', parsed.error.flatten());
  //     }
  //     const result = await deps.service.search({
  //       cids: parsed.data.cids,
  //       clientKey: req.ctx!.hospcode,
  //     });
  //     res.json(result);
  //   }),
  // );

  return router;
}
