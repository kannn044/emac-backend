/**
 * Drug allergy history — domain types
 * ข้อมูลจากไฟล์ parquet มาตรฐาน HDC (drugallergy_*.parquet)
 */

/** 1 record ประวัติแพ้ยา (คอลัมน์ตามไฟล์ parquet HDC) */
export interface AllergyRecord {
  hospcode: string;
  pid: string;
  cid: string;
  dateRecord: string | null; // YYYY-MM-DD
  drugAllergy: string | null; // รหัสยา/สารก่อภูมิแพ้
  dname: string | null; // ชื่อยา
  typeDx: string | null; // ประเภทการวินิจฉัย
  aLevel: string | null; // ระดับความรุนแรง
  symptom: string | null; // อาการ
  informant: string | null; // ผู้แจ้ง
  informHosp: string | null; // รพ. ที่แจ้ง
  provider: string | null;
  hospcode9: string | null;
  hosp9InformHosp: string | null;
  dateUpdate: string | null; // ISO timestamp
}

/** ผลการค้นหาประวัติแพ้ยาตาม CID (multi — ยังไม่เปิดใช้) */
export interface AllergySearchResult {
  records: AllergyRecord[];
  count: number;
  /** true = ผลถูกตัดเพราะชนโควตารายวัน (ยังมี record เพิ่มที่ไม่ได้คืน) */
  truncated: boolean;
  quota: QuotaStatus;
}

/** record ดิบจาก parquet (ทุกคอลัมน์ยกเว้น HOSPCODE, PID, CID) */
export type AllergyRawRecord = Record<string, string | null>;

/** ผลการค้นหาตาม CID เดียว — records เป็นคอลัมน์ดิบตาม parquet */
export interface AllergySearchOneResult {
  records: AllergyRawRecord[];
  count: number;
  truncated: boolean;
  quota: QuotaStatus;
}

/** สถานะโควตารายวันของ client */
export interface QuotaStatus {
  limit: number;
  used: number; // ใช้ไปแล้ววันนี้ (หลัง request นี้)
  remaining: number;
  /** เวลารีเซ็ตโควตาครั้งถัดไป (ISO, เที่ยงคืน ICT) */
  resetAt: string;
}
