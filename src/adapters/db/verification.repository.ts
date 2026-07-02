/**
 * PgVerificationRepository — เขียน verify/reject/note แบบ transactional (workflow.md §6)
 *
 * saveVerified: BEGIN → lock row (FOR UPDATE) → guard pending → INSERT allergy_verification
 *               → UPDATE status='verified' → COMMIT (fail = ROLLBACK ทั้งหมด)
 * ทิศเดียวกับ P4-3 (transaction rollback ครบเมื่อ insert card fail ในอนาคต)
 */
import type { Pool, PoolClient } from 'pg';
import { AppError } from '@/core/errors';
import type {
  NewRejection,
  NewVerification,
  VerificationRepository,
} from '@/modules/verification/ports';
import type { VerificationRecord } from '@/modules/verification/types';

interface VerRow {
  id: string;
  patient_id: string;
  provider_id: string;
  hospcode: string;
  confirmed_drugs: VerificationRecord['confirmedDrugs'];
  biomarker: string | null;
  severity: VerificationRecord['severity'];
  manifestations: string[];
  cross_reactive_drugs: string[];
  alternative_drugs: string[];
  note: string | null;
  canonical_payload: string;
  signature: string;
  signature_alg: string;
  key_id: string;
  signed_at: Date | string;
}

function rowToRecord(row: VerRow): VerificationRecord {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    providerId: row.provider_id,
    hospcode: row.hospcode,
    decision: 'verified',
    confirmedDrugs: row.confirmed_drugs ?? [],
    biomarker: row.biomarker,
    severity: row.severity,
    manifestations: row.manifestations ?? [],
    crossReactiveDrugs: row.cross_reactive_drugs ?? [],
    alternativeDrugs: row.alternative_drugs ?? [],
    note: row.note,
    canonicalPayload: row.canonical_payload,
    signature: row.signature,
    signatureAlg: row.signature_alg,
    keyId: row.key_id,
    signedAt:
      row.signed_at instanceof Date
        ? row.signed_at.toISOString()
        : new Date(row.signed_at).toISOString(),
  };
}

export class PgVerificationRepository implements VerificationRepository {
  constructor(private readonly pool: Pool) {}

  private async lockPending(
    client: PoolClient,
    hospcode: string,
    patientId: string,
  ): Promise<void> {
    const cur = await client.query<{ status: string }>(
      `SELECT status FROM patient_drugallergy
       WHERE id = $1 AND hospcode = $2 FOR UPDATE`,
      [patientId, hospcode],
    );
    if (cur.rowCount === 0) throw AppError.notFound('ไม่พบข้อมูลผู้ป่วย');
    if (cur.rows[0]?.status !== 'pending') {
      throw AppError.conflict('record นี้ถูกดำเนินการแล้ว (read-only)');
    }
  }

  async getByPatient(
    hospcode: string,
    patientId: string,
  ): Promise<VerificationRecord | null> {
    if (!/^\d+$/.test(patientId)) return null;
    const res = await this.pool.query<VerRow>(
      `SELECT * FROM allergy_verification WHERE patient_id = $1 AND hospcode = $2 LIMIT 1`,
      [patientId, hospcode],
    );
    return res.rows[0] ? rowToRecord(res.rows[0]) : null;
  }

  async saveVerified(v: NewVerification): Promise<VerificationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockPending(client, v.hospcode, v.patientId);

      const ins = await client.query<VerRow>(
        `INSERT INTO allergy_verification
           (patient_id, provider_id, hospcode, decision, confirmed_drugs,
            biomarker, severity, manifestations, cross_reactive_drugs,
            alternative_drugs, note, canonical_payload, signature,
            signature_alg, key_id, signed_at)
         VALUES ($1,$2,$3,'verified',$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          v.patientId,
          v.providerId,
          v.hospcode,
          JSON.stringify(v.confirmedDrugs),
          v.biomarker,
          v.severity,
          v.manifestations,
          v.crossReactiveDrugs,
          v.alternativeDrugs,
          v.note,
          v.canonicalPayload,
          v.signature,
          v.signatureAlg,
          v.keyId,
          v.signedAt,
        ],
      );

      await client.query(
        `UPDATE patient_drugallergy
         SET status = 'verified', note = $3, updated_at = now()
         WHERE id = $1 AND hospcode = $2`,
        [v.patientId, v.hospcode, v.note],
      );

      await client.query('COMMIT');
      return rowToRecord(ins.rows[0]!);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async saveRejected(r: NewRejection): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockPending(client, r.hospcode, r.patientId);

      await client.query(
        `INSERT INTO rejected_records
           (patient_id, provider_id, hospcode, reason, snapshot)
         VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [r.patientId, r.providerId, r.hospcode, r.reason, JSON.stringify(r.snapshot)],
      );
      await client.query(
        `UPDATE patient_drugallergy SET status = 'rejected', updated_at = now()
         WHERE id = $1 AND hospcode = $2`,
        [r.patientId, r.hospcode],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateNote(
    hospcode: string,
    patientId: string,
    note: string,
  ): Promise<void> {
    const res = await this.pool.query(
      `UPDATE patient_drugallergy SET note = $3, updated_at = now()
       WHERE id = $1 AND hospcode = $2 AND status = 'pending'`,
      [patientId, hospcode, note],
    );
    if (res.rowCount === 0) {
      throw AppError.conflict('แก้ note ไม่ได้ (ไม่พบ หรือถูก stamp แล้ว)');
    }
  }
}
