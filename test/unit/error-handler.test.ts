import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import pino from 'pino';
import { AppError } from '@/core/errors';
import { errorHandler, notFoundHandler } from '@/http/middleware/error-handler';
import { requestId } from '@/http/middleware/request-id';

function appThatThrows(err: unknown) {
  const app = express();
  app.use(requestId());
  app.get('/boom', () => {
    throw err;
  });
  app.use(notFoundHandler());
  app.use(errorHandler(pino({ level: 'silent' })));
  return app;
}

describe('error handler (P0-6)', () => {
  it('maps AppError to JSON with code + http status', async () => {
    const res = await request(appThatThrows(AppError.conflict('already verified'))).get(
      '/boom',
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toBe('already verified');
  });

  it('hides internal details for 5xx (no leak)', async () => {
    const res = await request(
      appThatThrows(new Error('secret stacktrace detail')),
    ).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('secret stacktrace');
  });

  it('exposes details for 4xx when provided', async () => {
    const res = await request(
      appThatThrows(AppError.badRequest('invalid', { field: 'status' })),
    ).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ field: 'status' });
  });
});
