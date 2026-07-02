import { z } from 'zod';

/**
 * Column contract ของไฟล์ ETL (parquet) ที่ server ภายนอกวางมาให้
 * 1 แถว = ยา 1 รายการ ของผู้ป่วย 1 admit (drug-level, ยังไม่ aggregate)
 *
 *   HOSPCODE, PID, DIAGCODE, DATETIME_ADMIT   ← ระดับ admit (ซ้ำกันในกลุ่มเดียว)
 *   DIDSTD, DNAME, DATE_SERV                  ← ระดับยา (ต่างกันแต่ละแถว)
 *
 * ถ้า ETL เพิ่ม column ในอนาคต (เช่น CID, TMT24, SRC_HOSPCODE) → เพิ่มที่ schema นี้
 * เป็น optional ได้โดยไม่ทำของเดิมพัง
 */
export const EtlDrugRowSchema = z.object({
  HOSPCODE: z.string().min(1),
  PID: z.string().min(1),
  DIAGCODE: z.string().min(1),
  // รับได้ทั้ง Date (จาก parquet) และ string (จาก csv/json) แล้ว normalize ภายหลัง
  DATETIME_ADMIT: z.union([z.string().min(1), z.date()]),
  DIDSTD: z.string().min(1),
  DNAME: z.string().min(1),
  DATE_SERV: z.union([z.string().min(1), z.date()]),
});

export type EtlDrugRow = z.infer<typeof EtlDrugRowSchema>;

/** รายชื่อ column ตามลำดับ — ใช้สร้าง parquet schema / validate header */
export const ETL_COLUMNS = [
  'HOSPCODE',
  'PID',
  'DIAGCODE',
  'DATETIME_ADMIT',
  'DIDSTD',
  'DNAME',
  'DATE_SERV',
] as const;

/** ยาที่ต้องสงสัย 1 รายการ (snapshot ลง suspect_drugs JSONB) */
export interface SuspectDrug {
  didstd: string; // TMT standard id
  dname: string;
  dateServ: string; // YYYY-MM-DD
  group: string | null; // ผลจาก classifier (NSAID/Antibiotic/Allopurinol/Carbamazepine/...)
}

/** record ระดับผู้ป่วยที่พร้อม UPSERT เข้า patient_drugallergy */
export interface PatientAllergyRecord {
  naturalKey: string; // hash(hospcode|pid|datetime_admit|diagcode) — idempotent key
  hospcode: string; // 5 หลัก (tenant key)
  pid: string;
  diagcode: string; // normalized: L511 | L512 | L519
  datetimeAdmit: string; // YYYY-MM-DD
  suspectDrugs: SuspectDrug[];
  nsaidGroups: string[];
  systemicNsaids: string[];
  antibioticGroups: string[];
  otherGroups: string[]; // Allopurinol, Carbamazepine ฯลฯ
}

/** ผลการ UPSERT 1 batch */
export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number; // เช่น row ที่ verified แล้ว (ห้ามแตะ)
}

/** ผลการ import 1 ไฟล์ */
export interface IngestRunResult {
  file: string;
  checksum: string;
  status: 'imported' | 'skipped_duplicate' | 'failed';
  rowsRead: number;
  patientsAffected: number;
  upsert: UpsertResult;
  error?: string;
}
