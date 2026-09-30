/** Read-only audit: reports IDs/counts, never patient names or identifiers. */
import 'dotenv/config';
import { createPool } from '@/adapters/db/pool';
import { loadConfig } from '@/config/index';

async function main(): Promise<void> {
  const pool = createPool(loadConfig().database.url, { max: 1 });
  try {
    const patients = await pool.query(`SELECT id FROM patient_drugallergy
      WHERE full_name IS NULL OR full_name !~ '^ผู้ป่วยทดสอบ [0-9]+$'
        OR pid !~ '^MOCK-PID-[0-9]+$'
        OR hn IS NULL OR hn !~ '^MOCK-HN-[0-9]+$'
        OR cid IS NOT NULL OR birth_date IS NOT NULL
        OR address IS DISTINCT FROM 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง'
      ORDER BY id`);
    const cards = await pool.query(`SELECT count(*) AS count FROM allergy_card
      WHERE COALESCE(payload->>'fullName', '') !~ '^ผู้ป่วยทดสอบ [0-9]+$'
        OR COALESCE(payload->>'pid', '') !~ '^MOCK-PID-[0-9]+$'
        OR COALESCE(payload->>'hn', '') !~ '^MOCK-HN-[0-9]+$'
        OR payload->>'cid' IS NOT NULL OR payload->>'birthDate' IS NOT NULL`);
    console.log(JSON.stringify({
      remainingPatients: patients.rows.length,
      remainingPatientRowIds: patients.rows.map(row => row.id),
      historicalCardsWithOldIdentity: Number(cards.rows[0].count),
      note: 'Read-only check. Unknown records and signed historical cards are not rewritten.',
    }, null, 2));
    if (patients.rows.length || Number(cards.rows[0].count)) process.exitCode = 1;
  } finally { await pool.end(); }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
