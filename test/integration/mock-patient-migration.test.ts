import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { SEED_PATIENTS } from '@/modules/patients/fixtures';

const migration = readFileSync(new URL('../../src/db/migrations/0012_label_mock_patients.sql', import.meta.url), 'utf8');
const legacy = JSON.parse(readFileSync(new URL('../helpers/legacy-mock-patients.json', import.meta.url), 'utf8'));

describe('mock patient migration', () => {
  it('updates only exact legacy seeds, preserves workflow and stays consistent with new seeds', async () => {
    const db = newDb();
    db.public.none(`CREATE TABLE patient_drugallergy (
      id SERIAL PRIMARY KEY, natural_key TEXT UNIQUE, hospcode TEXT, pid TEXT,
      cid TEXT, hn TEXT, full_name TEXT, birth_date DATE, address TEXT,
      updated_at TIMESTAMPTZ, status TEXT, note TEXT
    )`);
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    try {
      for (const row of legacy) {
        await pool.query(`INSERT INTO patient_drugallergy
          (natural_key, hospcode, pid, cid, hn, full_name, birth_date, address, status, note)
          VALUES ($1,$2,$3,$4,$5,$6,'1980-01-01','old address','verified','keep clinical note')`,
        [row.oldkey, row.hosp, row.pid, row.cid, row.hn, row.name]);
      }
      // A similar-looking CID is not evidence that a row is our seed.
      await pool.query(`INSERT INTO patient_drugallergy
        (natural_key,hospcode,pid,cid,hn,full_name,address)
        VALUES ('unrelated','10670','external','9999900000001','external','unchanged','unchanged')`);
      await pool.query(migration);
      const first = (await pool.query('SELECT * FROM patient_drugallergy ORDER BY id')).rows;
      expect(first).toHaveLength(13);
      for (let i = 0; i < 12; i++) {
        const row = first[i];
        const seed = SEED_PATIENTS[i]!;
        expect(row.id).toBe(i + 1);
        expect(row.full_name).toBe(`ผู้ป่วยทดสอบ ${String(i + 1).padStart(3, '0')}`);
        expect(row.pid).toBe(seed.pid);
        expect(row.hn).toBe(seed.hn);
        expect(row.cid).toBeNull();
        expect(row.birth_date).toBeNull();
        expect(row.address).toBe(seed.address);
        expect(row.natural_key).toBe(createHash('sha256')
          .update(`${seed.hospcode}|${seed.pid}|${seed.datetimeAdmit}|${seed.diagcode}`).digest('hex'));
        expect(row.status).toBe('verified');
        expect(row.note).toBe('keep clinical note');
      }
      expect(first[12].full_name).toBe('unchanged');
      expect(first[12].address).toBe('unchanged');
      await pool.query(migration);
      expect((await pool.query('SELECT * FROM patient_drugallergy ORDER BY id')).rows).toEqual(first);
    } finally { await pool.end(); }
  });

  it('runs on an empty database without inserting demo patients', () => {
    const db = newDb();
    db.public.none(`CREATE TABLE patient_drugallergy (
      natural_key TEXT, hospcode TEXT, pid TEXT, cid TEXT, hn TEXT,
      full_name TEXT, birth_date DATE, address TEXT, updated_at TIMESTAMPTZ
    )`);
    db.public.none(migration);
    expect(db.public.many('SELECT * FROM patient_drugallergy')).toEqual([]);
  });
});
