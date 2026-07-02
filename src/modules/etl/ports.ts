import type {
  EtlDrugRow,
  IngestRunResult,
  PatientAllergyRecord,
  UpsertResult,
} from './types';

/**
 * Module-local ports สำหรับ ETL ingestion
 * domain/importer เรียกผ่าน interface เหล่านี้ — ไม่รู้จัก parquet lib / pg โดยตรง
 */

/** อ่านไฟล์ ETL เป็น row dict (parquet วันนี้, csv/json วันหน้าได้โดยไม่แก้ importer) */
export interface RowSource {
  readonly format: string; // 'parquet' | 'csv' | ...
  /** อ่านทั้งไฟล์เป็น raw rows (ยังไม่ validate — importer จะ validate ด้วย zod) */
  read(filePath: string): Promise<Record<string, unknown>[]>;
}

/** repository ของตารางตั้งต้น patient_drugallergy */
export interface PatientDrugAllergyRepository {
  /**
   * UPSERT ตาม natural_key:
   *  - ใหม่ → insert สถานะ pending
   *  - เดิมที่ยังไม่ verify/reject → update payload ได้
   *  - เดิมที่ verified แล้ว → ห้ามแตะ (นับเป็น skipped)
   */
  upsertBatch(records: PatientAllergyRecord[]): Promise<UpsertResult>;
}

/** บันทึกประวัติการ import แต่ละไฟล์ (track ใน DB กันนำเข้าซ้ำ) */
export interface IngestLogRepository {
  /** เคยนำเข้าไฟล์ checksum นี้สำเร็จแล้วหรือยัง (idempotent by content) */
  isAlreadyImported(checksum: string): Promise<boolean>;
  /** บันทึกผลการ run 1 ไฟล์ */
  record(result: IngestRunResult): Promise<void>;
}

/** re-export เพื่อให้ adapter import จากที่เดียว */
export type { EtlDrugRow };
