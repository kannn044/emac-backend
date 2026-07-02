import { z } from 'zod';

/**
 * Typed, validated configuration.
 *
 * โหลดจาก env แล้ว validate ด้วย zod — ถ้า field บังคับขาด/ผิด → throw ตอน boot (fail fast)
 * ทุกค่าที่ระบบใช้ต้องผ่านที่นี่ที่เดียว (ห้าม process.env กระจัดกระจาย)
 */

/** normalize base path: '' | '/drugallergy' (leading slash, ไม่มี trailing slash) */
function normalizeBasePath(p: string): string {
  if (!p) return '';
  let s = p.trim();
  if (s === '/' || s === '') return '';
  if (!s.startsWith('/')) s = `/${s}`;
  return s.replace(/\/+$/, '');
}

const ConfigSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  logLevel: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  http: z.object({
    // service ถูก mount ใต้ path นี้ (อยู่หลัง nginx ของ domain ที่แชร์หลาย service)
    basePath: z.string().default('').transform(normalizeBasePath),
    // URL สาธารณะเต็มของ service — ใช้สร้าง absolute URL (OIDC redirect, card QR, render link)
    publicBaseUrl: z.string().url().optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
    // เชื่อ X-Forwarded-* จาก reverse proxy (ตั้ง true เมื่ออยู่หลัง nginx)
    trustProxy: z
      .enum(['true', 'false', '1', '0'])
      .transform((v) => v === 'true' || v === '1')
      .default('false'),
  }),

  database: z.object({
    url: z
      .string({ required_error: 'DATABASE_URL is required' })
      .min(1, 'DATABASE_URL is required'),
  }),

  adapters: z.object({
    authProvider: z.enum(['mock', 'real']).default('mock'),
    keyService: z.enum(['local', 'kms']).default('local'),
    // ที่เก็บ keypair: postgres (default) | memory (dev/mock ไม่ต้องมี DB)
    keyStore: z.enum(['postgres', 'memory']).default('postgres'),
    // แหล่งข้อมูลผู้ป่วย/audit: postgres (default) | memory (dev/demo ด้วย seed)
    dataStore: z.enum(['postgres', 'memory']).default('postgres'),
    consentProvider: z.enum(['mock', 'real']).default('mock'),
    hisConnector: z.enum(['mock', 'real']).default('mock'),
  }),

  session: z.object({
    jwtSecret: z
      .string({ required_error: 'SESSION_JWT_SECRET is required' })
      .min(8, 'SESSION_JWT_SECRET too short'),
    ttlSeconds: z.coerce.number().int().positive().default(900),
  }),

  etl: z.object({
    retroWindowDays: z.coerce.number().int().positive().default(30),
    inboxDir: z.string().min(1).default('data/inbox'),
    dropDrugsAfterAdmit: z
      .enum(['true', 'false', '1', '0'])
      .transform((v) => v === 'true' || v === '1')
      .default('true'),
  }),

  rollout: z.object({
    // ว่าง = ไม่จำกัด tenant
    hospcodeAllowlist: z.array(z.string()).default([]),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * สร้าง config จาก env object (default = process.env).
 * รับ env เข้ามาได้เพื่อให้ test กำหนดค่าเองได้ (deterministic, ไม่แตะ global).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const candidate = {
    env: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    http: {
      basePath: env.HTTP_BASE_PATH,
      publicBaseUrl: env.PUBLIC_BASE_URL,
      trustProxy: env.TRUST_PROXY,
    },
    database: { url: env.DATABASE_URL },
    adapters: {
      authProvider: env.AUTH_PROVIDER,
      keyService: env.KEY_SERVICE,
      keyStore: env.KEY_STORE,
      dataStore: env.DATA_STORE,
      consentProvider: env.CONSENT_PROVIDER,
      hisConnector: env.HIS_CONNECTOR,
    },
    session: {
      jwtSecret: env.SESSION_JWT_SECRET,
      ttlSeconds: env.SESSION_JWT_TTL_SECONDS,
    },
    etl: {
      retroWindowDays: env.RETRO_WINDOW_DAYS,
      inboxDir: env.ETL_INBOX_DIR,
      dropDrugsAfterAdmit: env.ETL_DROP_DRUGS_AFTER_ADMIT,
    },
    rollout: { hospcodeAllowlist: parseList(env.HOSPCODE_ALLOWLIST) },
  };

  const result = ConfigSchema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return result.data;
}
