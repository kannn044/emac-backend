import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, env: string): Logger {
  return pino({
    level,
    // pretty เฉพาะ dev; prod/test = JSON ล้วน (machine-readable)
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      // กัน PII/secret หลุดเข้า log
      paths: ['req.headers.authorization', '*.cid', '*.password', '*.privateKey'],
      censor: '[redacted]',
    },
    transport:
      env === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });
}
