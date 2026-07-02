/**
 * Error model กลาง — ทุก error ที่ตั้งใจโยนในระบบใช้ AppError
 * error-handler (HTTP layer) จะ map เป็น JSON มาตรฐาน { error: { code, message, details } }
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'INTERNAL'
  | 'SERVICE_UNAVAILABLE';

const CODE_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: unknown; expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = CODE_STATUS[code];
    this.details = options.details;
    // 5xx ไม่ expose รายละเอียดภายในออกไป client โดย default
    this.expose = options.expose ?? this.httpStatus < 500;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message = 'Bad request', details?: unknown): AppError {
    return new AppError('BAD_REQUEST', message, { details });
  }
  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError('UNAUTHORIZED', message);
  }
  static forbidden(message = 'Forbidden'): AppError {
    return new AppError('FORBIDDEN', message);
  }
  static notFound(message = 'Not found'): AppError {
    return new AppError('NOT_FOUND', message);
  }
  static conflict(message = 'Conflict', details?: unknown): AppError {
    return new AppError('CONFLICT', message, { details });
  }
  static unprocessable(message = 'Unprocessable', details?: unknown): AppError {
    return new AppError('UNPROCESSABLE', message, { details });
  }
  static internal(message = 'Internal error', details?: unknown): AppError {
    return new AppError('INTERNAL', message, { details, expose: false });
  }
  static unavailable(message = 'Service unavailable'): AppError {
    return new AppError('SERVICE_UNAVAILABLE', message);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
