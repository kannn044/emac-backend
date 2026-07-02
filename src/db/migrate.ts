/**
 * Migration runner แบบเบา (ไม่พึ่ง ORM) — รัน .sql ใน src/db/migrations ตามลำดับชื่อไฟล์
 * track ที่ตาราง schema_migrations; รันซ้ำได้ (ข้ามไฟล์ที่ apply แล้ว)
 *
 *   npx tsx src/db/migrate.ts
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { loadConfig } from '@/config/index';
import { createPool } from '@/adapters/db/pool';
import { createLogger } from '@/core/logger';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

interface MigrateLogger {
  info?: (msg: string) => void;
}

export async function runMigrations(
  databaseUrl: string,
  log: MigrateLogger = console,
): Promise<string[]> {
  const pool = createPool(databaseUrl, { max: 2 });
  const applied: string[] = [];
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const done = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [
        file,
      ]);
      if ((done.rowCount ?? 0) > 0) continue;

      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        log.info?.(`applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration failed: ${file}: ${String(err)}`);
      } finally {
        client.release();
      }
    }
    return applied;
  } finally {
    await pool.end();
  }
}

// รันโดยตรง (ไม่ใช่ตอน import)
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, config.env);
  runMigrations(config.database.url, logger)
    .then((applied) =>
      logger.info({ count: applied.length }, 'migrations complete'),
    )
    .catch((err) => {
      logger.error({ err }, 'migration error');
      process.exit(1);
    });
}
