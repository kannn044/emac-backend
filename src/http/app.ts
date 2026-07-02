import express, { Router, type Express } from 'express';
import { pinoHttp } from 'pino-http';
import type { Container } from '@/core/container';
import { requestId } from './middleware/request-id';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { patientsRouter } from './routes/patients';
import { verificationRouter, keysRouter } from './routes/verification';
import {
  publicCardsRouter,
  authCardsRouter,
  embedRouter,
} from './routes/cards';

/**
 * App factory — ประกอบ Express app จาก container
 * แยกจากการ listen() เพื่อให้ test ยิงผ่าน supertest ได้โดยไม่เปิด port
 *
 * service อาจถูก deploy ใต้ base path (เช่น /drugallergy) หลัง nginx ของ domain
 * ที่แชร์หลาย service → mount ทุก route ใต้ config.http.basePath
 * ('' = root สำหรับ dev/test; '/drugallergy' = production)
 */
export function createApp(container: Container): Express {
  const app = express();
  const { basePath, trustProxy } = container.config.http;

  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', true); // เชื่อ X-Forwarded-* จาก nginx

  app.use(requestId());
  app.use(
    pinoHttp({
      logger: container.logger,
      genReqId: (req) => (req as { id?: string }).id ?? 'unknown',
      autoLogging: container.config.env !== 'test',
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // รวมทุก route ไว้ใน router เดียว แล้ว mount ใต้ base path
  const router = Router();
  router.use(healthRouter(container.healthProbes));
  // Auth / identity (P2)
  router.use(
    authRouter({
      provider: container.auth,
      authService: container.authService,
      sessions: container.sessions,
    }),
  );
  // API v1 — feature modules (P3+)
  // public (ไม่ต้อง auth) — ต้อง mount ก่อน router ที่บังคับ auth
  router.use('/api/v1', keysRouter({ keys: container.keys }));
  router.use('/api/v1', publicCardsRouter({ cards: container.cardsService }));
  router.use(embedRouter({ cards: container.cardsService })); // /embed/card/:token (root)

  router.use(
    '/api/v1',
    patientsRouter({
      sessions: container.sessions,
      patients: container.patientsService,
    }),
  );
  router.use(
    '/api/v1',
    verificationRouter({
      sessions: container.sessions,
      verification: container.verificationService,
      cards: container.cardsService,
    }),
  );
  router.use(
    '/api/v1',
    authCardsRouter({
      sessions: container.sessions,
      cards: container.cardsService,
    }),
  );

  app.use(basePath || '/', router);

  // ปลายทาง: 404 + error handler (ต้องอยู่ท้ายสุด)
  app.use(notFoundHandler());
  app.use(errorHandler(container.logger));

  return app;
}
