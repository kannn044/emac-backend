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
    // access token — อายุสั้น (default 30 นาที)
    ttlSeconds: z.coerce.number().int().positive().default(1800),
    // refresh token / เพดาน session — refresh ได้จนถึง login + ค่านี้ (default 12 ชม.)
    refreshTtlSeconds: z.coerce.number().int().positive().default(43200),
  }),

  /**
   * MOPH Provider ID (OAuth2 Authorization Code) — ใช้เมื่อ AUTH_PROVIDER=real
   * อ้างอิง "คู่มือการเชื่อมต่อระบบด้วย OAuth ของ Provider ID" (26 พ.ค. 2568):
   *   authorize : GET  {baseUrl}/v1/oauth2/authorize
   *   token     : POST {baseUrl}/v1/oauth2/token   (Basic client_id:secret)
   *   profile   : GET  {baseUrl}/api/v1/services/profile
   * UAT: https://uat-provider.id.th | PRD: https://provider.id.th
   */
  mophProvider: z.object({
    baseUrl: z.string().url().optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
    clientId: z.string().default(''),
    clientSecret: z.string().default(''),
    // ต้องตรงเป๊ะกับที่ลงทะเบียนไว้กับ Provider ID (exact match)
    redirectUri: z.string().default(''),
    // scope ที่ client ได้รับอนุมัติ (คั่นด้วย space)
    scope: z.string().default('cid name_th name_eng organization'),
    // URL หน้า callback ฝั่ง frontend — GET /auth/callback จะ redirect ต่อไปที่นี่พร้อม ?code
    frontendCallbackUrl: z.string().default(''),
    // third-party OAuth broker: URL ที่อนุญาตให้เด้ง code กลับ (ว่าง = ปิดฟีเจอร์)
    // entry เป็น origin (อนุญาตทุก path) หรือ URL เต็ม (ต้องตรง path) — ดู oauth-state.ts
    thirdPartyRedirectAllowlist: z.array(z.string()).default([]),
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

  /**
   * Drug allergy history query — อ่านจากไฟล์ parquet (drugallergy_*.parquet) บน server
   * ด้วย DuckDB (read_parquet glob) แล้วค้นด้วย CID
   */
  drugAllergy: z.object({
    // glob path ของไฟล์ parquet บน server เช่น /data/drugallergy/drugallergy_*.parquet
    // ว่าง = ปิด endpoint (ตอบ 503)
    parquetGlob: z.string().default(''),
    // โควตา record ที่ดึงได้ต่อ client ต่อวัน (reset เที่ยงคืน ICT)
    dailyRecordLimit: z.coerce.number().int().positive().default(10000),
    // จำกัดจำนวน CID ต่อ 1 request (กัน IN list ยาวเกิน)
    maxCidsPerRequest: z.coerce.number().int().positive().default(5000),
  }),
}).superRefine((cfg, ctx) => {
  // AUTH_PROVIDER=real → ต้องมี config MOPH Provider ID ครบ (fail fast ตอน boot)
  if (cfg.adapters.authProvider === 'real') {
    const required: Array<[string, string | undefined]> = [
      ['mophProvider.baseUrl (MOPH_PROVIDER_BASE_URL)', cfg.mophProvider.baseUrl],
      ['mophProvider.clientId (MOPH_PROVIDER_CLIENT_ID)', cfg.mophProvider.clientId || undefined],
      ['mophProvider.clientSecret (MOPH_PROVIDER_CLIENT_SECRET)', cfg.mophProvider.clientSecret || undefined],
      ['mophProvider.redirectUri (MOPH_PROVIDER_REDIRECT_URI)', cfg.mophProvider.redirectUri || undefined],
    ];
    for (const [name, value] of required) {
      if (!value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} is required when AUTH_PROVIDER=real`,
        });
      }
    }
  }
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
      refreshTtlSeconds: env.SESSION_REFRESH_TTL_SECONDS,
    },
    mophProvider: {
      baseUrl: env.MOPH_PROVIDER_BASE_URL,
      clientId: env.MOPH_PROVIDER_CLIENT_ID,
      clientSecret: env.MOPH_PROVIDER_CLIENT_SECRET,
      redirectUri: env.MOPH_PROVIDER_REDIRECT_URI,
      scope: env.MOPH_PROVIDER_SCOPE,
      frontendCallbackUrl: env.MOPH_PROVIDER_FRONTEND_CALLBACK_URL,
      thirdPartyRedirectAllowlist: parseList(env.THIRD_PARTY_REDIRECT_ALLOWLIST),
    },
    etl: {
      retroWindowDays: env.RETRO_WINDOW_DAYS,
      inboxDir: env.ETL_INBOX_DIR,
      dropDrugsAfterAdmit: env.ETL_DROP_DRUGS_AFTER_ADMIT,
    },
    rollout: { hospcodeAllowlist: parseList(env.HOSPCODE_ALLOWLIST) },
    drugAllergy: {
      parquetGlob: env.DRUGALLERGY_PARQUET_GLOB,
      dailyRecordLimit: env.DRUGALLERGY_DAILY_LIMIT,
      maxCidsPerRequest: env.DRUGALLERGY_MAX_CIDS,
    },
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
