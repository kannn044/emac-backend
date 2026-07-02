import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

/** ติด request id (ใช้ header ที่ส่งมา หรือ gen ใหม่) เพื่อ trace ข้าม log */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    req.id = incoming && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader('x-request-id', req.id);
    next();
  };
}
