import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import pino from 'pino';
import { EtlImporter } from '@/modules/etl/importer';
import { ParquetRowSource } from '@/adapters/parquet/parquet-row-source';
import { aggregateRows } from '@/modules/etl/aggregate';
import { InMemoryIngestLog, InMemoryPatientRepo } from '../helpers/in-memory-repos';
import { SAMPLE_ROWS, writeParquet } from '../../scripts/gen-mock-parquet';

const logger = pino({ level: 'silent' });
let dir: string;
let parquetPath: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'etl-test-'));
  parquetPath = join(dir, 'etl-sample.parquet');
  await writeParquet(parquetPath, SAMPLE_ROWS);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeImporter() {
  const patients = new InMemoryPatientRepo();
  const ingestLog = new InMemoryIngestLog();
  const importer = new EtlImporter({
    source: new ParquetRowSource(),
    patients,
    ingestLog,
    logger,
  });
  return { importer, patients, ingestLog };
}

describe('parquet round-trip', () => {
  it('reads back all written rows with contract columns', async () => {
    const rows = await new ParquetRowSource().read(parquetPath);
    expect(rows).toHaveLength(SAMPLE_ROWS.length);
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ['DATETIME_ADMIT', 'DATE_SERV', 'DIAGCODE', 'DIDSTD', 'DNAME', 'HOSPCODE', 'PID'].sort(),
    );
  });
});

describe('EtlImporter (P1-5/6)', () => {
  it('P1-5: first import inserts pending patient records', async () => {
    const { importer, patients, ingestLog } = makeImporter();
    const result = await importer.importFile(parquetPath);

    expect(result.status).toBe('imported');
    expect(result.patientsAffected).toBe(2); // P001 + P002
    expect(result.upsert.inserted).toBe(2);
    expect(patients.size).toBe(2);
    expect(ingestLog.records).toHaveLength(1);

    for (const stored of patients.store.values()) {
      expect(stored.status).toBe('pending');
    }
  });

  it('P1-6: re-importing same file is skipped (duplicate checksum)', async () => {
    const { importer, patients } = makeImporter();
    await importer.importFile(parquetPath);
    const second = await importer.importFile(parquetPath);

    expect(second.status).toBe('skipped_duplicate');
    expect(second.upsert.inserted).toBe(0);
    expect(patients.size).toBe(2); // ไม่เพิ่ม duplicate
  });

  it('records a failed run when source throws', async () => {
    const patients = new InMemoryPatientRepo();
    const ingestLog = new InMemoryIngestLog();
    const importer = new EtlImporter({
      source: {
        format: 'parquet',
        read: async () => {
          throw new Error('corrupt parquet');
        },
      },
      patients,
      ingestLog,
      logger,
    });
    const result = await importer.importFile(parquetPath);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('corrupt');
    expect(ingestLog.records[0]?.status).toBe('failed');
  });
});

describe('repository semantics (P1-7)', () => {
  it('does not overwrite a verified record', async () => {
    const { records } = aggregateRows(SAMPLE_ROWS);
    const patients = new InMemoryPatientRepo();

    // import ครั้งแรก → pending
    await patients.upsertBatch(records);
    const targetKey = records[0]!.naturalKey;

    // จำลองว่าเภสัช verify แล้ว
    patients.setStatus(targetKey, 'verified');

    // ETL รอบใหม่ส่ง payload เดิมมาอีก
    const second = await patients.upsertBatch(records);

    expect(second.skipped).toBeGreaterThanOrEqual(1);
    expect(patients.get(targetKey)?.status).toBe('verified'); // ไม่ถูกแตะ
  });
});
