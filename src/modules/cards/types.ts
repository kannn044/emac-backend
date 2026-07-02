/**
 * Cards module types (workflow.md §7) — E-Allergy Card (immutable) ที่ออกหลัง verify
 * card อ้างลายเซ็นของ decision (P4) → ตรวจความแท้ด้วย public key ของ provider
 */
import type { ConfirmedDrug, Severity } from '@/modules/verification/types';

/** ข้อมูลที่แสดงบนบัตร (ตามฟอร์แมตบัตรแพ้ยา สธ.) */
export interface CardPayload {
  hn: string | null;
  pid: string;
  cid: string | null;
  // demographics (หน้าปกบัตร)
  fullName: string | null;
  sex: string | null;
  birthDate: string | null;
  address: string | null;
  diagcode: string;
  hospcode: string;
  hospitalName: string;
  providerId: string;
  providerName: string;
  confirmedDrugs: ConfirmedDrug[]; // มี adverseReaction + assessment ต่อยา
  biomarker: string | null;
  severity: Severity;
  manifestations: string[];
  crossReactiveDrugs: string[];
  alternativeDrugs: string[];
  note: string | null;
  signedAt: string;
}

/** บัตร (immutable) */
export interface AllergyCard {
  id: string;
  patientId: string;
  verificationId: string;
  providerId: string;
  hospcode: string;
  renderToken: string; // opaque token สำหรับ embed (iframe)
  payload: CardPayload;
  canonicalPayload: string; // string ที่ถูกเซ็น (= decision ของ verification)
  signature: string;
  signatureAlg: string;
  keyId: string;
  issuedAt: string;
}

/** ผลตรวจความแท้ (public) — เปิดเผยเฉพาะข้อมูลที่จำเป็น ณ จุดจ่ายยา */
export interface CardVerifyResult {
  valid: boolean;
  cardId: string;
  issuer: { providerId: string; name: string };
  hospcode: string;
  hn: string | null;
  confirmedDrugs: ConfirmedDrug[];
  severity: Severity;
  biomarker: string | null;
  crossReactiveDrugs: string[];
  issuedAt: string;
  signedAt: string;
}

/** meta + ลิงก์ ที่ frontend ใช้ (หลัง issue หรือดึงบัตรของ record) */
export interface CardLinks {
  id: string;
  renderToken: string;
  issuedAt: string;
  verifyUrl: string; // public: ตรวจความแท้
  embedUrl: string; // HTML iframe
}
