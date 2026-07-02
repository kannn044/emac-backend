import type { Pool } from 'pg';
import type { PatientDrugAllergyRepository } from '@/modules/etl/ports';
import type { PatientAllergyRecord, UpsertResult } from '@/modules/etl/types';

/**
 * Postgres impl ของ patient_drugallergy (workflow.md §3)
 *
 * UPSERT ด้วย ON CONFLICT (natural_key):
 *   - row ใหม่ → insert (status='pending')
 *   - row เดิม status='pending' → update payload ยา
 *   - row เดิม status IN ('verified','rejected') → DO NOTHING (ห้ามแตะ control plane)
 *
 * นับ inserted/updated/skipped จาก xmax (0 = insert ใหม่) และ rowCount
 */
export class PgPatientDrugAllergyRepository
  implements PatientDrugAllergyRepository
{
  constructor(private readonly pool: Pool) {}

  async upsertBatch(records: PatientAllergyRecord[]): Promise<UpsertResult> {
    const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0 };
    if (records.length === 0) return result;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of records) {
        // RETURNING (xmax = 0) → true ถ้าเป็น insert ใหม่, false ถ้า update
        const res = await client.query<{ inserted: boolean }>(
          `
          INSERT INTO patient_drugallergy
            (natural_key, hospcode, pid, diagcode, datetime_admit,
             suspect_drugs, nsaid_groups, systemic_nsaids, antibiotic_groups,
             other_groups, status, source_loaded_at, updated_at)
          VALUES
            ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, 'pending', now(), now())
          ON CONFLICT (natural_key) DO UPDATE SET
             suspect_drugs     = EXCLUDED.suspect_drugs,
             nsaid_groups      = EXCLUDED.nsaid_groups,
             systemic_nsaids   = EXCLUDED.systemic_nsaids,
             antibiotic_groups = EXCLUDED.antibiotic_groups,
             other_groups      = EXCLUDED.other_groups,
             updated_at        = now()
          WHERE patient_drugallergy.status = 'pending'
          RETURNING (xmax = 0) AS inserted
          `,
          [
            r.naturalKey,
            r.hospcode,
            r.pid,
            r.diagcode,
            r.datetimeAdmit,
            JSON.stringify(r.suspectDrugs),
            r.nsaidGroups,
            r.systemicNsaids,
            r.antibioticGroups,
            r.otherGroups,
          ],
        );

        if (res.rowCount === 0) {
          // ON CONFLICT แต่ WHERE ไม่ผ่าน (verified/rejected) → ไม่แตะ
          result.skipped += 1;
        } else if (res.rows[0]?.inserted) {
          result.inserted += 1;
        } else {
          result.updated += 1;
        }
      }
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
