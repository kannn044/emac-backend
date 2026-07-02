/**
 * Patients module types — DTO สำหรับ list/detail (workflow.md §5)
 * สะท้อนตาราง patient_drugallergy (ETL) + รูปแบบ paging มาตรฐาน
 */
import type { SuspectDrug } from '@/modules/etl/types';

export type PatientStatus = 'pending' | 'verified' | 'rejected';

/** record ระดับผู้ป่วยเต็ม (domain) — repo คืนรูปนี้ก่อน map เป็น DTO */
export type Sex = 'male' | 'female' | 'other';

export interface PatientRecord {
  id: string; // bigserial (Postgres) หรือ uuid (memory) — string เสมอ
  hospcode: string; // tenant key
  pid: string;
  cid: string | null;
  hn: string | null;
  // demographics (จริงมาจาก HIS; mockup เติมเพื่อแสดงบนบัตร/รายการ)
  fullName: string | null;
  sex: Sex | null;
  birthDate: string | null; // YYYY-MM-DD
  address: string | null;
  diagcode: string; // L511 | L512 | L519
  datetimeAdmit: string; // YYYY-MM-DD
  suspectDrugs: SuspectDrug[];
  nsaidGroups: string[];
  systemicNsaids: string[];
  antibioticGroups: string[];
  otherGroups: string[];
  status: PatientStatus;
  note: string | null; // หมายเหตุก่อน stamp (แก้ได้เฉพาะ pending)
  sourceLoadedAt: string; // ISO
  updatedAt: string; // ISO
}

/** สรุปสำหรับ list (คิว) — ไม่ต้องส่ง suspect_drugs เต็ม */
export interface PatientListItem {
  id: string;
  hn: string | null;
  pid: string;
  fullName: string | null;
  sex: Sex | null;
  diagcode: string;
  datetimeAdmit: string;
  status: PatientStatus;
  drugCount: number;
  groups: string[]; // union ของ nsaid/antibiotic/other groups (โชว์ chip)
  updatedAt: string;
}

/** รายละเอียดเต็มสำหรับหน้า detail */
export interface PatientDetail extends PatientListItem {
  cid: string | null;
  birthDate: string | null;
  address: string | null;
  suspectDrugs: SuspectDrug[];
  nsaidGroups: string[];
  systemicNsaids: string[];
  antibioticGroups: string[];
  otherGroups: string[];
  note: string | null;
  sourceHospcode: string; // รพ. ที่ admit (= hospcode)
  sourceLoadedAt: string;
}

/** query params ของ list (hospcode ไม่อยู่ที่นี่ — มาจาก token เท่านั้น) */
export interface PatientListQuery {
  status?: PatientStatus;
  q?: string; // ค้นด้วย HN หรือ PID
  diagcode?: string;
  admitFrom?: string; // YYYY-MM-DD (รวม)
  admitTo?: string; // YYYY-MM-DD (รวม)
  group?: string; // กรองด้วยกลุ่มยา (เช่น 'Carbamazepine', 'Penicillins')
  page: number; // 1-based
  pageSize: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
