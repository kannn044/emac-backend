import { Pool, type PoolConfig } from 'pg';
import type { HealthProbe } from '@/ports/index';

/** สร้าง Postgres connection pool (กัน connection exhaustion ตอน traffic สูง) */
export function createPool(databaseUrl: string, extra: PoolConfig = {}): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...extra,
  });
}

/** HealthProbe สำหรับ /readyz — ping DB ด้วย SELECT 1 */
export class PostgresHealthProbe implements HealthProbe {
  readonly name = 'postgres';
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async check(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
