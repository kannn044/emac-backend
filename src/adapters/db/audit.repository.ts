/**
 * PgAuditLogRepository — เขียน verification_audit_log (ทุก action ที่แตะข้อมูล/เปลี่ยน state)
 */
import type { Pool } from 'pg';
import type { AuditEntry, AuditLogRepository } from '@/modules/patients/ports';

export class PgAuditLogRepository implements AuditLogRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO verification_audit_log
         (action, provider_id, hospcode, patient_id, request_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        entry.action,
        entry.providerId,
        entry.hospcode,
        entry.patientId,
        entry.requestId ?? null,
        entry.detail ? JSON.stringify(entry.detail) : null,
      ],
    );
  }
}
