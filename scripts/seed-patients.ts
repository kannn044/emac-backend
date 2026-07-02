/**
 * Seed patients เข้า Postgres (dev/demo) — ใช้ชุดเดียวกับ in-memory fixtures
 *
 *   npm run seed:patients          # insert (ข้ามตัวที่ natural_key ซ้ำ)
 *
 * ต้องมี Postgres + รัน migration ก่อน (npm run migrate)
 * natural_key = sha256(hospcode|pid|datetime_admit|diagcode) ให้ idempotent
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { loadConfig } from '@/config/index';
import { createPool } from '@/adapters/db/pool';
import { createLogger } from '@/core/logger';
import { SEED_PATIENTS } from '@/modules/patients/fixtures';

function naturalKey(
  hospcode: string,
  pid: string,
  admit: string,
  diagcode: string,
): string {
  return createHash('sha256')
    .update(`${hospcode}|${pid}|${admit}|${diagcode}`)
    .digest('hex');
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, config.env);
  const pool = createPool(config.database.url, { max: 2 });

  let inserted = 0;
  let skipped = 0;
  try {
    for (const p of SEED_PATIENTS) {
      const res = await pool.query(
        `INSERT INTO patient_drugallergy
           (natural_key, hospcode, pid, cid, hn, full_name, sex, birth_date, address,
            diagcode, datetime_admit, suspect_drugs, nsaid_groups, systemic_nsaids,
            antibiotic_groups, other_groups, status, note, source_loaded_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (natural_key) DO NOTHING`,
        [
          naturalKey(p.hospcode, p.pid, p.datetimeAdmit, p.diagcode),
          p.hospcode,
          p.pid,
          p.cid,
          p.hn,
          p.fullName,
          p.sex,
          p.birthDate,
          p.address,
          p.diagcode,
          p.datetimeAdmit,
          JSON.stringify(p.suspectDrugs),
          p.nsaidGroups,
          p.systemicNsaids,
          p.antibioticGroups,
          p.otherGroups,
          p.status,
          p.note,
          p.sourceLoadedAt,
          p.updatedAt,
        ],
      );
      if ((res.rowCount ?? 0) > 0) inserted += 1;
      else skipped += 1;
    }
    logger.info({ inserted, skipped }, 'seed patients complete');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('seed error:', err);
  process.exit(1);
});
