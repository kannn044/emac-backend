import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';
import type { AppConfig } from '@/config/index';
import type { Clock, EventBus, HealthProbe, IdGenerator } from '@/ports/index';
import { createLogger, type Logger } from './logger';
import { SystemClock, UuidGenerator } from './clock';
import { InProcessEventBus } from './event-bus';
import { createPool, PostgresHealthProbe } from '@/adapters/db/pool';
import type {
  AuthProvider,
  KeyService,
  SigningKeyStore,
} from '@/modules/auth/ports';
import { MockAuthProvider } from '@/adapters/auth/mock-auth.provider';
import { MophProviderAuthProvider } from '@/adapters/auth/moph-provider.provider';
import { LocalKeyService } from '@/adapters/keys/local-key.service';
import {
  InMemorySigningKeyStore,
  PostgresSigningKeyStore,
} from '@/adapters/keys/signing-key.store';
import { SessionService } from '@/modules/auth/session.service';
import { AuthService } from '@/modules/auth/auth.service';
import type {
  AuditLogRepository,
  PatientQueryRepository,
} from '@/modules/patients/ports';
import { PatientsService } from '@/modules/patients/patients.service';
import { PgPatientQueryRepository } from '@/adapters/db/patient-query.repository';
import { PgAuditLogRepository } from '@/adapters/db/audit.repository';
import { PgVerificationRepository } from '@/adapters/db/verification.repository';
import {
  InMemoryAuditLogRepository,
  InMemoryPatientStore,
} from '@/adapters/memory/patient-query.memory';
import type { VerificationRepository } from '@/modules/verification/ports';
import { VerificationService } from '@/modules/verification/verification.service';
import type { CardRepository } from '@/modules/cards/ports';
import { CardService } from '@/modules/cards/cards.service';
import { PgCardRepository } from '@/adapters/db/card.repository';
import { InMemoryCardRepository } from '@/adapters/memory/card.memory';
import type {
  AllergySource,
  AllergyQuotaStore,
  ServiceAccessLogRepository,
} from '@/modules/drugallergy/ports';
import { DrugAllergyService } from '@/modules/drugallergy/drugallergy.service';
import { DuckDbAllergySource } from '@/adapters/parquet/duckdb-allergy-source';
import { MockAllergySource } from '@/adapters/memory/mock-allergy-source';
import { PgAllergyQuotaStore } from '@/adapters/db/allergy-quota.repository';
import { InMemoryAllergyQuotaStore } from '@/adapters/memory/allergy-quota.memory';
import { PgServiceAccessLogRepository } from '@/adapters/db/service-access-log.repository';

/**
 * Container — สิ่งที่ทุก module ใช้ร่วมกัน (ประกอบครั้งเดียวที่ composition root)
 * เพิ่ม service/adapter ใหม่ = เพิ่ม field ที่นี่ แล้ว inject เข้า module
 */
export interface Container {
  config: AppConfig;
  logger: Logger;
  clock: Clock;
  ids: IdGenerator;
  events: EventBus;
  db: Pool;
  healthProbes: HealthProbe[];
  // Auth / identity (P2)
  auth: AuthProvider;
  keys: KeyService;
  sessions: SessionService;
  authService: AuthService;
  portalAuth: AuthProvider;
  portalSessions: SessionService;
  portalAuthService: AuthService;
  // Patients (P3)
  patientsService: PatientsService;
  // Verification (P4)
  verificationService: VerificationService;
  // Cards (P5)
  cardsService: CardService;
  // Drug allergy history query (parquet/DuckDB)
  drugAllergyService: DrugAllergyService;
  searchService: DrugAllergyService;
  // Access log ของ service endpoint (/drugallergy/lookup)
  serviceAccessLogRepo: ServiceAccessLogRepository;
  shutdown(): Promise<void>;
}

/**
 * Overrides — ให้ test แทน dependency บางตัวได้โดยไม่ต้องตั้ง DB จริง
 */
export interface ContainerOverrides {
  logger?: Logger;
  clock?: Clock;
  ids?: IdGenerator;
  db?: Pool;
  allergySource?: AllergySource;
  allergyQuota?: AllergyQuotaStore;
  serviceAccessLogRepo?: ServiceAccessLogRepository;
  healthProbes?: HealthProbe[];
  auth?: AuthProvider;
  keyStore?: SigningKeyStore;
  patientRepo?: PatientQueryRepository;
  auditRepo?: AuditLogRepository;
  verificationRepo?: VerificationRepository;
  cardRepo?: CardRepository;
}

export function buildContainer(
  config: AppConfig,
  overrides: ContainerOverrides = {},
): Container {
  const logger = overrides.logger ?? createLogger(config.logLevel, config.env);
  const clock = overrides.clock ?? new SystemClock();
  const ids = overrides.ids ?? new UuidGenerator();
  const events = new InProcessEventBus(logger);
  const db = overrides.db ?? createPool(config.database.url);

  const healthProbes =
    overrides.healthProbes ?? [new PostgresHealthProbe(db)];

  // Third-party OAuth always uses Provider ID; only portal auth can be mock.
  const auth: AuthProvider =
    overrides.auth ??
    new MophProviderAuthProvider(
      {
        // Missing credentials fail closed when OAuth is called; never use mock.
        baseUrl: config.mophProvider.baseUrl ?? '',
        clientId: config.mophProvider.clientId,
        clientSecret: config.mophProvider.clientSecret,
        redirectUri: config.mophProvider.redirectUri,
        scope: config.mophProvider.scope,
      },
      logger,
    );
  const portalAuth = config.adapters.portalAuthProvider === 'mock'
    ? new MockAuthProvider() : auth;

  const keyStore: SigningKeyStore =
    overrides.keyStore ??
    (config.adapters.keyStore === 'memory'
      ? new InMemorySigningKeyStore() // dev/mock ไม่ต้องมี Postgres
      : new PostgresSigningKeyStore(db));

  const keys: KeyService = new LocalKeyService(keyStore, clock);

  const sessions = new SessionService(
    createHmac('sha256', config.session.jwtSecret).update('emac:third-party:v1').digest('hex'),
    config.session.ttlSeconds,
    config.session.refreshTtlSeconds,
    clock,
  );

  const authService = new AuthService(
    auth,
    keys,
    sessions,
    config.rollout.hospcodeAllowlist,
  );

  const portalSessions = new SessionService(
    createHmac('sha256', config.session.jwtSecret)
      .update(`emac:portal:${config.adapters.portalAuthProvider}:v1`).digest('hex'),
    config.session.ttlSeconds,
    config.session.refreshTtlSeconds,
    clock,
  );
  const portalAuthService = new AuthService(
    portalAuth, keys, portalSessions, config.rollout.hospcodeAllowlist,
  );

  // ---- Patients / verification / audit (P3–P4) — เลือก store ตาม config ----
  const useMemoryData = config.adapters.dataStore === 'memory';
  // memory mode: ใช้ store เดียวกันทั้งอ่าน+เขียน → verify แล้วสะท้อนใน list ทันที
  const memStore = useMemoryData ? new InMemoryPatientStore() : null;

  const patientRepo: PatientQueryRepository =
    overrides.patientRepo ??
    (memStore ?? new PgPatientQueryRepository(db));
  const auditRepo: AuditLogRepository =
    overrides.auditRepo ??
    (useMemoryData
      ? new InMemoryAuditLogRepository()
      : new PgAuditLogRepository(db));
  const verificationRepo: VerificationRepository =
    overrides.verificationRepo ??
    (memStore ?? new PgVerificationRepository(db));

  const cardRepo: CardRepository =
    overrides.cardRepo ??
    (useMemoryData ? new InMemoryCardRepository() : new PgCardRepository(db));
  const cardsService = new CardService(cardRepo, keys, ids, clock, config);

  // ---- Drug allergy history query (parquet/DuckDB + quota) ----
  const allergySource: AllergySource =
    overrides.allergySource ??
    (config.drugAllergy.dataMode === 'mock'
      ? new MockAllergySource()
      : new DuckDbAllergySource(config.drugAllergy.parquetGlob, logger));
  const allergyQuota: AllergyQuotaStore =
    overrides.allergyQuota ??
    (useMemoryData
      ? new InMemoryAllergyQuotaStore()
      : new PgAllergyQuotaStore(db));
  const searchService = new DrugAllergyService(
    overrides.allergySource ?? new DuckDbAllergySource(config.drugAllergy.parquetGlob, logger),
    overrides.allergyQuota ?? new PgAllergyQuotaStore(db),
    clock,
    config.drugAllergy.dailyRecordLimit,
    config.drugAllergy.maxCidsPerRequest,
    config.service.maxRecords,
  );
  const drugAllergyService = new DrugAllergyService(
    allergySource,
    allergyQuota,
    clock,
    config.drugAllergy.dailyRecordLimit,
    config.drugAllergy.maxCidsPerRequest,
    config.service.maxRecords,
  );

  const serviceAccessLogRepo: ServiceAccessLogRepository =
    overrides.serviceAccessLogRepo ??
    new PgServiceAccessLogRepository(db);

  const patientsService = new PatientsService(patientRepo, auditRepo, clock);
  const verificationService = new VerificationService(
    patientRepo,
    verificationRepo,
    keys,
    auditRepo,
    clock,
    cardsService,
  );

  return {
    config,
    logger,
    clock,
    ids,
    events,
    db,
    healthProbes,
    auth,
    keys,
    sessions,
    authService,
    portalAuth,
    portalSessions,
    portalAuthService,
    searchService,
    patientsService,
    verificationService,
    cardsService,
    drugAllergyService,
    serviceAccessLogRepo,
    async shutdown() {
      await db.end().catch(() => undefined);
    },
  };
}
