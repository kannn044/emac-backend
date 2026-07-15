/**
 * DuckDbAllergySource — อ่านประวัติแพ้ยาจากไฟล์ parquet ด้วย DuckDB
 *
 * ใช้ read_parquet(glob, union_by_name=true) → สแกนไฟล์ drugallergy_*.parquet ทุกไฟล์
 * ในครั้งเดียว แล้วกรองด้วย CID IN (...) — เร็วมากเพราะ DuckDB อ่านเฉพาะ column/row group
 * ที่ต้องใช้ (columnar + predicate pushdown) เหมาะกับ bigdata
 *
 * - lazy import '@duckdb/node-api' (native binding) ตอนใช้จริง → test ที่ไม่แตะ endpoint นี้
 *   ไม่ต้องโหลด native
 * - instance/connection (in-memory) สร้างครั้งเดียว reuse
 * - CAST date/timestamp → VARCHAR เพื่อได้ ISO string สะอาด (ไม่ใช่ object ของ DuckDB)
 */
import type { Logger } from '@/core/logger';
import { AppError } from '@/core/errors';
import type { AllergySource } from '@/modules/drugallergy/ports';
import type { AllergyRecord } from '@/modules/drugallergy/types';

// โครงสร้างขั้นต่ำของ @duckdb/node-api ที่ใช้ (เลี่ยง import type ตอน build ถ้ายังไม่ install)
interface DuckConn {
  runAndReadAll(
    sql: string,
    params: Record<string, unknown>,
  ): Promise<{ getRowObjects(): Record<string, unknown>[] }>;
}

const SELECT_COLUMNS = `
  CAST(HOSPCODE AS VARCHAR)          AS hospcode,
  CAST(PID AS VARCHAR)              AS pid,
  CAST(CID AS VARCHAR)             AS cid,
  CAST(DATERECORD AS VARCHAR)      AS "dateRecord",
  CAST(DRUGALLERGY AS VARCHAR)     AS "drugAllergy",
  CAST(DNAME AS VARCHAR)           AS dname,
  CAST(TYPEDX AS VARCHAR)          AS "typeDx",
  CAST(ALEVEL AS VARCHAR)          AS "aLevel",
  CAST(SYMPTOM AS VARCHAR)         AS symptom,
  CAST(INFORMANT AS VARCHAR)       AS informant,
  CAST(INFORMHOSP AS VARCHAR)      AS "informHosp",
  CAST(PROVIDER AS VARCHAR)        AS provider,
  CAST(HOSPCODE9 AS VARCHAR)       AS hospcode9,
  CAST(HOSP9_INFORMHOSP AS VARCHAR) AS "hosp9InformHosp",
  CAST(D_UPDATE AS VARCHAR)        AS "dateUpdate"
`;

export class DuckDbAllergySource implements AllergySource {
  private connPromise: Promise<DuckConn> | null = null;

  constructor(
    private readonly parquetGlob: string,
    private readonly logger?: Logger,
  ) {}

  private async conn(): Promise<DuckConn> {
    if (!this.connPromise) {
      this.connPromise = (async () => {
        // dynamic import — โหลด native binding ตอนใช้จริงเท่านั้น
        const { DuckDBInstance } = await import('@duckdb/node-api');
        const instance = await DuckDBInstance.create(':memory:');
        return (await instance.connect()) as unknown as DuckConn;
      })().catch((err) => {
        this.connPromise = null; // ให้ลองใหม่ครั้งหน้า
        throw err;
      });
    }
    return this.connPromise;
  }

  async queryByCids(cids: string[], limit: number): Promise<AllergyRecord[]> {
    if (!this.parquetGlob) {
      throw AppError.unavailable('ยังไม่ได้ตั้งค่าแหล่งข้อมูลแพ้ยา (DRUGALLERGY_PARQUET_GLOB)');
    }
    if (cids.length === 0 || limit <= 0) return [];

    const placeholders = cids.map((_, i) => `$c${i}`).join(', ');
    const params: Record<string, unknown> = { glob: this.parquetGlob, lim: limit };
    cids.forEach((c, i) => {
      params[`c${i}`] = c;
    });

    const sql = `
      SELECT ${SELECT_COLUMNS}
      FROM read_parquet($glob, union_by_name = true)
      WHERE CID IN (${placeholders})
      ORDER BY cid, "dateRecord"
      LIMIT $lim
    `;

    let rows: Record<string, unknown>[];
    try {
      const con = await this.conn();
      const reader = await con.runAndReadAll(sql, params);
      rows = reader.getRowObjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // glob ไม่เจอไฟล์ = ยังไม่มีข้อมูล → คืนว่าง (ไม่ 500) แต่ log ไว้
      if (/No files found|IO Error|could not/i.test(msg)) {
        this.logger?.warn({ glob: this.parquetGlob, msg }, 'allergy parquet: no files / read error');
        return [];
      }
      this.logger?.error({ err }, 'allergy parquet query failed');
      throw AppError.internal('ค้นหาข้อมูลแพ้ยาไม่สำเร็จ');
    }

    return rows.map(toRecord);
  }

  /**
   * ค้น CID เดียว → คืนทุกคอลัมน์ยกเว้น HOSPCODE, PID, CID (ชื่อคอลัมน์ตาม parquet)
   * ใช้ SELECT * EXCLUDE(...) REPLACE(...) — คอลัมน์ใหม่ในไฟล์จะไหลผ่านอัตโนมัติ
   * (CAST คอลัมน์ date/timestamp ที่รู้จัก → VARCHAR ให้ได้ string สะอาด)
   */
  async queryOneRaw(
    cid: string,
    limit: number,
  ): Promise<Record<string, string | null>[]> {
    if (!this.parquetGlob) {
      throw AppError.unavailable('ยังไม่ได้ตั้งค่าแหล่งข้อมูลแพ้ยา (DRUGALLERGY_PARQUET_GLOB)');
    }
    if (!cid || limit <= 0) return [];

    const sql = `
      SELECT * EXCLUDE (HOSPCODE, PID, CID)
        REPLACE (
          CAST(DATERECORD AS VARCHAR) AS DATERECORD,
          CAST(D_UPDATE AS VARCHAR) AS D_UPDATE,
          CAST(HDC_DATE AS VARCHAR) AS HDC_DATE
        )
      FROM read_parquet($glob, union_by_name = true)
      WHERE CID = $cid
      ORDER BY DATERECORD
      LIMIT $lim
    `;

    let rows: Record<string, unknown>[];
    try {
      const con = await this.conn();
      const reader = await con.runAndReadAll(sql, {
        glob: this.parquetGlob,
        cid,
        lim: limit,
      });
      rows = reader.getRowObjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/No files found|IO Error|could not/i.test(msg)) {
        this.logger?.warn({ glob: this.parquetGlob, msg }, 'allergy parquet: no files / read error');
        return [];
      }
      this.logger?.error({ err }, 'allergy parquet query failed');
      throw AppError.internal('ค้นหาข้อมูลแพ้ยาไม่สำเร็จ');
    }

    // normalize ค่าทุกคอลัมน์เป็น string|null (ค่า date ถูก CAST เป็น varchar แล้ว)
    return rows.map((r) => {
      const out: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(r)) out[k] = s(v);
      return out;
    });
  }
}

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v);
  return str;
}

function toRecord(r: Record<string, unknown>): AllergyRecord {
  return {
    hospcode: s(r.hospcode) ?? '',
    pid: s(r.pid) ?? '',
    cid: s(r.cid) ?? '',
    dateRecord: s(r.dateRecord),
    drugAllergy: s(r.drugAllergy),
    dname: s(r.dname),
    typeDx: s(r.typeDx),
    aLevel: s(r.aLevel),
    symptom: s(r.symptom),
    informant: s(r.informant),
    informHosp: s(r.informHosp),
    provider: s(r.provider),
    hospcode9: s(r.hospcode9),
    hosp9InformHosp: s(r.hosp9InformHosp),
    dateUpdate: s(r.dateUpdate),
  };
}
