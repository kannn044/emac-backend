/**
 * Verification module ports — เขียนสถานะ verify/reject/note (tenant-scoped + atomic)
 * การเปลี่ยน state (pending→verified|rejected) ต้องทำใน transaction เดียวกับการบันทึก
 */
import type { ConfirmedDrug, Severity, VerificationRecord } from './types';

/** ข้อมูลสำหรับบันทึก verification (หลังเซ็นแล้ว) */
export interface NewVerification {
  patientId: string;
  providerId: string;
  hospcode: string;
  confirmedDrugs: ConfirmedDrug[];
  biomarker: string | null;
  severity: Severity;
  manifestations: string[];
  crossReactiveDrugs: string[];
  alternativeDrugs: string[];
  note: string | null;
  canonicalPayload: string;
  signature: string;
  signatureAlg: string;
  keyId: string;
  signedAt: string;
}

export interface NewRejection {
  patientId: string;
  providerId: string;
  hospcode: string;
  reason: string;
  snapshot: Record<string, unknown>;
}

export interface VerificationRepository {
  /** verification เดิมของ record (null = ยังไม่เคย verify) */
  getByPatient(
    hospcode: string,
    patientId: string,
  ): Promise<VerificationRecord | null>;

  /**
   * บันทึก verification + set patient=verified ใน transaction เดียว
   * โยน CONFLICT ถ้า record ไม่อยู่สถานะ pending, NOT_FOUND ถ้าไม่พบ/ข้าม tenant
   */
  saveVerified(v: NewVerification): Promise<VerificationRecord>;

  /** snapshot ไป rejected_records + set patient=rejected (transaction เดียว) */
  saveRejected(r: NewRejection): Promise<void>;

  /** แก้ note ได้เฉพาะตอน pending (หลัง stamp → CONFLICT) */
  updateNote(hospcode: string, patientId: string, note: string): Promise<void>;
}
