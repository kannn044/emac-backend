import type { NextFunction, Request, Response } from 'express';
import { AppError, isAppError } from '@/core/errors';
import type { Logger } from '@/core/logger';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

/** 404 handler — route ไม่รู้จัก */
export function notFoundHandler() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    next(AppError.notFound(`Route not found: ${req.method} ${req.path}`));
  };
}

/** error handler กลาง — map ทุก error เป็น JSON มาตรฐาน */
export function errorHandler(logger: Logger) {
  // 4 args = Express error middleware (ห้ามตัด next ออก)
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const appErr = isAppError(err)
      ? err
      : AppError.internal('Unexpected error', { cause: String(err) });

    if (appErr.httpStatus >= 500) {
      logger.error({ err, requestId: req.id }, 'request failed');
    } else {
      logger.warn(
        { code: appErr.code, requestId: req.id },
        'request rejected',
      );
    }

    const body: ErrorBody = {
      error: {
        code: appErr.code,
        message: appErr.expose ? appErr.message : 'Internal server error',
        requestId: req.id,
      },
    };
    if (appErr.expose && appErr.details !== undefined) {
      body.error.details = appErr.details;
    }

    res.status(appErr.httpStatus).json(body);
  };
}
