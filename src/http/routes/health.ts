import { Router } from 'express';
import type { HealthProbe } from '@/ports/index';

/**
 * /healthz — liveness: process ยังอยู่ (ไม่เช็ค dependency)
 * /readyz  — readiness: dependency (DB ฯลฯ) พร้อมรับ traffic จริงไหม
 */
export function healthRouter(probes: HealthProbe[]): Router {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  router.get('/readyz', async (_req, res) => {
    const results = await Promise.all(
      probes.map(async (p) => ({ name: p.name, ok: await p.check() })),
    );
    const ready = results.every((r) => r.ok);
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks: results,
    });
  });

  return router;
}
