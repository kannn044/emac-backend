/**
 * PgAllergyQuotaStore — ตัวนับโควตารายวันใน Postgres
 * ตาราง drugallergy_quota (client_key, quota_date) → used_records
 *
 * reserve ใช้ transaction + SELECT ... FOR UPDATE เพื่อความถูกต้องแน่นอน
 * (lock แถวของ client เดียวกัน → serialize การเพิ่มโควตา กัน race)
 */
import type { Pool } from 'pg';
import type { AllergyQuotaStore } from '@/modules/drugallergy/ports';

export class PgAllergyQuotaStore implements AllergyQuotaStore {
  constructor(private readonly pool: Pool) {}

  async peek(clientKey: string, quotaDate: string): Promise<number> {
    const res = await this.pool.query<{ used_records: number }>(
      `SELECT used_records FROM drugallergy_quota
       WHERE client_key = $1 AND quota_date = $2`,
      [clientKey, quotaDate],
    );
    return res.rows[0]?.used_records ?? 0;
  }

  /**
   * เพิ่ม used_records โดย cap ที่ limit — granted = จำนวนที่เพิ่มได้จริง
   * ทำใน transaction: ensure row → lock (FOR UPDATE) → คำนวณ → update
   */
  async reserve(
    clientKey: string,
    quotaDate: string,
    want: number,
    limit: number,
  ): Promise<{ granted: number; usedAfter: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // ให้แถวมีอยู่ก่อน (ไม่ชนกับ concurrent insert)
      await client.query(
        `INSERT INTO drugallergy_quota (client_key, quota_date, used_records)
         VALUES ($1, $2, 0)
         ON CONFLICT (client_key, quota_date) DO NOTHING`,
        [clientKey, quotaDate],
      );

      // lock แถว + อ่านค่าปัจจุบัน (serialize ต่อ client_key)
      const cur = await client.query<{ used_records: number }>(
        `SELECT used_records FROM drugallergy_quota
         WHERE client_key = $1 AND quota_date = $2
         FOR UPDATE`,
        [clientKey, quotaDate],
      );
      const before = cur.rows[0]?.used_records ?? 0;

      const granted = Math.max(0, Math.min(want, limit - before));
      const usedAfter = before + granted;

      if (granted > 0) {
        await client.query(
          `UPDATE drugallergy_quota
             SET used_records = $3, updated_at = now()
           WHERE client_key = $1 AND quota_date = $2`,
          [clientKey, quotaDate, usedAfter],
        );
      }

      await client.query('COMMIT');
      return { granted, usedAfter };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
