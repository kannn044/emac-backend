import type { Pool } from 'pg';
import type { IngestLogRepository } from '@/modules/etl/ports';
import type { IngestRunResult } from '@/modules/etl/types';

/** Postgres impl ของ etl_ingest_log — track ไฟล์ที่ import (กันซ้ำด้วย checksum) */
export class PgIngestLogRepository implements IngestLogRepository {
  constructor(private readonly pool: Pool) {}

  async isAlreadyImported(checksum: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM etl_ingest_log
        WHERE checksum = $1 AND status = 'imported' LIMIT 1`,
      [checksum],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async record(result: IngestRunResult): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO etl_ingest_log
        (file_name, checksum, status, rows_read, patients_affected,
         inserted, updated, skipped, error, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
      `,
      [
        result.file,
        result.checksum,
        result.status,
        result.rowsRead,
        result.patientsAffected,
        result.upsert.inserted,
        result.upsert.updated,
        result.upsert.skipped,
        result.error ?? null,
      ],
    );
  }
}
