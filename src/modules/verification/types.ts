/**
 * Verification module types (workflow.md §6) — เภสัช/แพทย์ ยืนยัน/ปฏิเสธ + ลงนามดิจิทัล
 * ฟิลด์คลินิก (biomarker/cross-reactive/alternatives/manifestations/severity) เภสัชกรกรอกตอน verify
 */

export type Severity = 'mild' | 'moderate' | 'severe' | 'life-threatening';

export const SEVERITIES: readonly Severity[] = [
  'mild',
  'moderate',
  'severe',
  'life-threatening',
];

/**
 * ผลการประเมินความสัมพันธ์ยา-อาการ (ตามบัตรแพ้ยา สธ.)
 * 1=ใช่แน่นอน 2=น่าจะใช่ 3=อาจจะใช่ H=ประวัติการแพ้ยา
 */
export type AssessmentCode = '1' | '2' | '3' | 'H';

export const ASSESSMENT_CODES: readonly AssessmentCode[] = ['1', '2', '3', 'H'];

export const ASSESSMENT_LABELS: Record<AssessmentCode, string> = {
  '1': 'ใช่แน่นอน',
  '2': 'น่าจะใช่',
  '3': 'อาจจะใช่',
  H: 'ประวัติการแพ้ยา',
};

/** ยา 1 รายการที่เภสัชยืนยันว่าแพ้จริง (subset ของ suspect_drugs) */
export interface ConfirmedDrug {
  didstd: string;
  dname: string; // ชื่อการค้า/ชื่อยา
  group: string | null;
  adverseReaction?: string; // อาการไม่พึงประสงค์ (ต่อยา) — คอลัมน์บนบัตร
  assessment?: AssessmentCode; // ผลการประเมิน — default '1'
}

/** input ที่เภสัชกรกรอกตอน verify */
export interface VerifyInput {
  confirmedDrugs: ConfirmedDrug[];
  biomarker?: string; // เช่น HLA-B*15:02
  severity: Severity;
  manifestations: string[];
  crossReactiveDrugs: string[];
  alternativeDrugs: string[];
  note?: string;
}

/** record ที่บันทึกหลัง verify (พร้อมลายเซ็น) */
export interface VerificationRecord {
  id: string;
  patientId: string;
  providerId: string;
  hospcode: string;
  decision: 'verified';
  confirmedDrugs: ConfirmedDrug[];
  biomarker: string | null;
  severity: Severity;
  manifestations: string[];
  crossReactiveDrugs: string[];
  alternativeDrugs: string[];
  note: string | null;
  canonicalPayload: string; // string ที่ถูกเซ็น (ตรวจซ้ำได้)
  signature: string; // base64
  signatureAlg: string; // Ed25519
  keyId: string;
  signedAt: string; // ISO
}

/** payload ที่ถูก serialize เป็น canonical string แล้วเซ็น */
export interface VerificationSignPayload {
  patientId: string;
  hospcode: string;
  pid: string;
  cid: string | null;
  diagcode: string;
  datetimeAdmit: string;
  confirmedDrugs: ConfirmedDrug[];
  biomarker: string | null;
  severity: Severity;
  manifestations: string[];
  crossReactiveDrugs: string[];
  alternativeDrugs: string[];
  providerId: string;
  signedAt: string;
}

/** card preview (ยังไม่บันทึก — full render/PDF เป็น P5) */
export interface CardPreview {
  patientId: string;
  hn: string | null;
  pid: string;
  hospcode: string;
  diagcode: string;
  confirmedDrugs: ConfirmedDrug[];
  biomarker: string | null;
  severity: Severity;
  manifestations: string[];
  crossReactiveDrugs: string[];
  alternativeDrugs: string[];
  note: string | null;
  html: string; // preview HTML แบบง่าย (P5 จะ render เต็มจาก template)
}
