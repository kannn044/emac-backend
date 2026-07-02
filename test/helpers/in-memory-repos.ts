import type {
  IngestLogRepository,
  PatientDrugAllergyRepository,
} from '@/modules/etl/ports';
import type {
  IngestRunResult,
  PatientAllergyRecord,
  UpsertResult,
} from '@/modules/etl/types';

type StatusValue = 'pending' | 'verified' | 'rejected';

interface Stored {
  record: PatientAllergyRecord;
  status: StatusValue;
}

/**
 * In-memory patient repo — จำลอง semantics เดียวกับ Postgres adapter:
 *   ใหม่ → insert pending; เดิม pending → update; เดิม verified/rejected → skip
 * ใช้ทดสอบ importer/idempotency โดยไม่ต้องมี Postgres จริง
 */
export class InMemoryPatientRepo implements PatientDrugAllergyRepository {
  readonly store = new Map<string, Stored>();

  async upsertBatch(records: PatientAllergyRecord[]): Promise<UpsertResult> {
    const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0 };
    for (const r of records) {
      const existing = this.store.get(r.naturalKey);
      if (!existing) {
        this.store.set(r.naturalKey, { record: r, status: 'pending' });
        result.inserted += 1;
      } else if (existing.status === 'pending') {
        existing.record = r;
        result.updated += 1;
      } else {
        result.skipped += 1;
      }
    }
    return result;
  }

  // ---- test helpers ----
  setStatus(naturalKey: string, status: StatusValue): void {
    const s = this.store.get(naturalKey);
    if (s) s.status = status;
  }
  get(naturalKey: string): Stored | undefined {
    return this.store.get(naturalKey);
  }
  get size(): number {
    return this.store.size;
  }
}

/** In-memory ingest log — กันนำเข้าซ้ำด้วย checksum */
export class InMemoryIngestLog implements IngestLogRepository {
  readonly records: IngestRunResult[] = [];

  async isAlreadyImported(checksum: string): Promise<boolean> {
    return this.records.some(
      (r) => r.checksum === checksum && r.status === 'imported',
    );
  }
  async record(result: IngestRunResult): Promise<void> {
    this.records.push(result);
  }
}
