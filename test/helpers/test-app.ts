import pino from 'pino';
import type { Express } from 'express';
import { loadConfig } from '@/config/index';
import {
  buildContainer,
  type Container,
  type ContainerOverrides,
} from '@/core/container';
import { createApp } from '@/http/app';
import type { HealthProbe } from '@/ports/index';
import { InMemorySigningKeyStore } from '@/adapters/keys/signing-key.store';

const BASE_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  SESSION_JWT_SECRET: 'test-secret-key',
  // P3: ใช้ in-memory data store (seed) ให้ e2e รันได้โดยไม่ต้องมี Postgres
  DATA_STORE: 'memory',
};

/** HealthProbe ปลอม คุมผลได้ (สำหรับทดสอบ /readyz) */
export class StubProbe implements HealthProbe {
  constructor(
    readonly name: string,
    private ok: boolean,
  ) {}
  setOk(ok: boolean): void {
    this.ok = ok;
  }
  async check(): Promise<boolean> {
    return this.ok;
  }
}

export interface TestHarness {
  app: Express;
  container: Container;
}

/** สร้าง container+app สำหรับ test โดยไม่ต้องมี Postgres จริง (inject stub) */
export function makeTestHarness(
  opts: {
    env?: NodeJS.ProcessEnv;
    probes?: HealthProbe[];
    overrides?: ContainerOverrides;
  } = {},
): TestHarness {
  const config = loadConfig({ ...BASE_ENV, ...opts.env });
  const overrides: ContainerOverrides = {
    logger: pino({ level: 'silent' }),
    // db ไม่ถูกใช้ตรง ๆ (memory adapters) — ใส่ stub กัน createPool
    db: { end: async () => undefined, query: async () => undefined } as never,
    healthProbes: opts.probes ?? [new StubProbe('postgres', true)],
    keyStore: new InMemorySigningKeyStore(),
    ...opts.overrides,
  };
  const container = buildContainer(config, overrides);
  return { app: createApp(container), container };
}

/** shortcut — คืนเฉพาะ app (ใช้ในเทสต์ส่วนใหญ่) */
export function makeTestApp(
  opts: { env?: NodeJS.ProcessEnv; probes?: HealthProbe[] } = {},
): Express {
  return makeTestHarness(opts).app;
}
