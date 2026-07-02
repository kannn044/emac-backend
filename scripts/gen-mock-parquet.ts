/**
 * สร้างไฟล์ parquet ตัวอย่าง (mockup สิ่งที่ server ETL ภายนอกจะวางมาให้)
 * column ตรงตาม contract: HOSPCODE,PID,DIAGCODE,DATETIME_ADMIT,DIDSTD,DNAME,DATE_SERV
 *
 *   npx tsx scripts/gen-mock-parquet.ts [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import parquet from '@dsnp/parquetjs';
import { ETL_COLUMNS } from '@/modules/etl/types';

const schema = new parquet.ParquetSchema(
  Object.fromEntries(ETL_COLUMNS.map((c) => [c, { type: 'UTF8' }])),
);

/** ยา 1 รายการ ของผู้ป่วย 1 admit (drug-level row) */
interface Row extends Record<string, unknown> {
  HOSPCODE: string;
  PID: string;
  DIAGCODE: string;
  DATETIME_ADMIT: string;
  DIDSTD: string;
  DNAME: string;
  DATE_SERV: string;
}

export const SAMPLE_ROWS: Row[] = [
  // ผู้ป่วย A @ รพ.10670 — SJS, ได้ Allopurinol + Amoxicillin ก่อน admit
  { HOSPCODE: '10670', PID: 'P001', DIAGCODE: 'L511', DATETIME_ADMIT: '2026-05-20', DIDSTD: 'TMT0001', DNAME: 'ALLOPURINOL 100 MG TABLET', DATE_SERV: '2026-05-02' },
  { HOSPCODE: '10670', PID: 'P001', DIAGCODE: 'L511', DATETIME_ADMIT: '2026-05-20', DIDSTD: 'TMT0002', DNAME: 'AMOXICILLIN 500 MG CAPSULE', DATE_SERV: '2026-05-05' },
  { HOSPCODE: '10670', PID: 'P001', DIAGCODE: 'L511', DATETIME_ADMIT: '2026-05-20', DIDSTD: 'TMT0002', DNAME: 'AMOXICILLIN 500 MG CAPSULE', DATE_SERV: '2026-05-05' }, // ซ้ำ → dedupe

  // ผู้ป่วย B @ รพ.10671 — TEN, ได้ Carbamazepine + Ibuprofen (มี NSAID topical ด้วย)
  { HOSPCODE: '10671', PID: 'P002', DIAGCODE: 'L512', DATETIME_ADMIT: '2026-06-01', DIDSTD: 'TMT0010', DNAME: 'CARBAMAZEPINE 200 MG TABLET', DATE_SERV: '2026-05-10' },
  { HOSPCODE: '10671', PID: 'P002', DIAGCODE: 'L512', DATETIME_ADMIT: '2026-06-01', DIDSTD: 'TMT0011', DNAME: 'IBUPROFEN 400 MG TABLET', DATE_SERV: '2026-05-12' },
  { HOSPCODE: '10671', PID: 'P002', DIAGCODE: 'L512', DATETIME_ADMIT: '2026-06-01', DIDSTD: 'TMT0012', DNAME: 'DICLOFENAC GEL TOPICAL', DATE_SERV: '2026-05-15' },

  // ผู้ป่วย B ได้ยา "หลัง" admit → ควรถูก guard ทิ้ง
  { HOSPCODE: '10671', PID: 'P002', DIAGCODE: 'L512', DATETIME_ADMIT: '2026-06-01', DIDSTD: 'TMT0099', DNAME: 'PARACETAMOL 500 MG TABLET', DATE_SERV: '2026-06-05' },

  // diagcode ไม่ใช่ L51% → ควรถูกข้าม
  { HOSPCODE: '10670', PID: 'P003', DIAGCODE: 'A099', DATETIME_ADMIT: '2026-05-22', DIDSTD: 'TMT0050', DNAME: 'OMEPRAZOLE 20 MG CAPSULE', DATE_SERV: '2026-05-01' },
];

export async function writeParquet(filePath: string, rows: Row[] = SAMPLE_ROWS): Promise<void> {
  const writer = await parquet.ParquetWriter.openFile(schema, filePath);
  for (const r of rows) {
    await writer.appendRow(r);
  }
  await writer.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2] ?? 'data/inbox';
  const outDir = isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
  const outFile = join(outDir, `etl-sample-${Date.now()}.parquet`);
  mkdir(outDir, { recursive: true })
    .then(() => writeParquet(outFile))
    .then(() => console.log(`wrote ${outFile} (${SAMPLE_ROWS.length} rows)`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
