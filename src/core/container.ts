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
} from '@/modules/drugallergy/ports';
import { DrugAllergyService } from '@/modules/drugallergy/drugallergy.service';
import { DuckDbAllergySource } from '@/adapters/parquet/duckdb-allergy-source';
import { PgAllergyQuotaStore } from '@/adapters/db/allergy-quota.repository';
import { InMemoryAllergyQuotaStore } from '@/adapters/memory/allergy-quota.memory';

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
  // Patients (P3)
  patientsService: PatientsService;
  // Verification (P4)
  verificationService: VerificationService;
  // Cards (P5)
  cardsService: CardService;
  // Drug allergy history query (parquet/DuckDB)
  drugAllergyService: DrugAllergyService;
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

  // ---- Auth / identity / keys (สลับ mock↔real ตาม config ที่จุดเดียวนี้) ----
  const auth: AuthProvider =
    overrides.auth ??
    (config.adapters.authProvider === 'mock'
      ? new MockAuthProvider()
      : new MophProviderAuthProvider(
          {
            // superRefine ใน config การันตีว่าค่าเหล่านี้ไม่ว่างเมื่อ authProvider=real
            baseUrl: config.mophProvider.baseUrl ?? '',
            clientId: config.mophProvider.clientId,
            clientSecret: config.mophProvider.clientSecret,
            redirectUri: config.mophProvider.redirectUri,
            scope: config.mophProvider.scope,
          },
          logger,
        ));

  const keyStore: SigningKeyStore =
    overrides.keyStore ??
    (config.adapters.keyStore === 'memory'
      ? new InMemorySigningKeyStore() // dev/mock ไม่ต้องมี Postgres
      : new PostgresSigningKeyStore(db));

  const keys: KeyService = new LocalKeyService(keyStore, clock);

  const sessions = new SessionService(
    config.session.jwtSecret,
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
    new DuckDbAllergySource(config.drugAllergy.parquetGlob, logger);
  const allergyQuota: AllergyQuotaStore =
    overrides.allergyQuota ??
    (useMemoryData
      ? new InMemoryAllergyQuotaStore()
      : new PgAllergyQuotaStore(db));
  const drugAllergyService = new DrugAllergyService(
    allergySource,
    allergyQuota,
    clock,
    config.drugAllergy.dailyRecordLimit,
    config.drugAllergy.maxCidsPerRequest,
  );

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
    patientsService,
    verificationService,
    cardsService,
    drugAllergyService,
    async shutdown() {
      await db.end().catch(() => undefined);
    },
  };
}
