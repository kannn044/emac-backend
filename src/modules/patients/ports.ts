/**
 * Patients module ports — repository contract (tenant-scoped ที่ layer นี้เสมอ)
 * caller ส่ง hospcode จาก AuthContext เข้ามา — repo บังคับ WHERE hospcode = $1 ทุก query
 */
import type {
  Paginated,
  PatientDetail,
  PatientListItem,
  PatientListQuery,
} from './types';

export interface PatientQueryRepository {
  /** list เฉพาะ tenant (hospcode) — filter/paging ตาม query */
  list(
    hospcode: string,
    query: PatientListQuery,
  ): Promise<Paginated<PatientListItem>>;

  /** detail เฉพาะ tenant — null ถ้าไม่พบ/ไม่ใช่ของ hospcode นี้ (กัน leak ข้าม รพ.) */
  findById(hospcode: string, id: string): Promise<PatientDetail | null>;
}

export type AuditAction = 'VIEW' | 'STAMP' | 'REJECT' | 'EDIT';

export interface AuditEntry {
  action: AuditAction;
  providerId: string;
  hospcode: string;
  patientId: string;
  requestId?: string;
  detail?: Record<string, unknown>;
}

export interface AuditLogRepository {
  record(entry: AuditEntry): Promise<void>;
}
