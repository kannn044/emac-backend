/**
 * PgPatientQueryRepository — list/detail จาก patient_drugallergy (workflow.md §5)
 *
 * tenant scope: WHERE hospcode = $1 เสมอ (มาจาก AuthContext ไม่ใช่ client)
 * filter เป็น query-builder แบบ additive (เพิ่มเงื่อนไข = push param) → paging มาตรฐาน
 */
import type { Pool } from 'pg';
import type { PatientQueryRepository } from '@/modules/patients/ports';
import type {
  Paginated,
  PatientDetail,
  PatientListItem,
  PatientListQuery,
  PatientRecord,
} from '@/modules/patients/types';
import type { SuspectDrug } from '@/modules/etl/types';
import { toDetail, toListItem } from '@/modules/patients/mapper';

interface PdaRow {
  id: string;
  hospcode: string;
  pid: string;
  cid: string | null;
  hn: string | null;
  full_name: string | null;
  sex: string | null;
  birth_date: Date | string | null;
  address: string | null;
  diagcode: string;
  datetime_admit: Date | string;
  suspect_drugs: SuspectDrug[];
  nsaid_groups: string[];
  systemic_nsaids: string[];
  antibiotic_groups: string[];
  other_groups: string[];
  status: PatientRecord['status'];
  note: string | null;
  source_loaded_at: Date | string;
  updated_at: Date | string;
}

function toDate(v: Date | string): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}
function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function rowToRecord(row: PdaRow): PatientRecord {
  return {
    id: String(row.id),
    hospcode: row.hospcode,
    pid: row.pid,
    cid: row.cid,
    hn: row.hn,
    fullName: row.full_name ?? null,
    sex: (row.sex as PatientRecord['sex']) ?? null,
    birthDate: row.birth_date ? toDate(row.birth_date) : null,
    address: row.address ?? null,
    diagcode: row.diagcode,
    datetimeAdmit: toDate(row.datetime_admit),
    suspectDrugs: row.suspect_drugs ?? [],
    nsaidGroups: row.nsaid_groups ?? [],
    systemicNsaids: row.systemic_nsaids ?? [],
    antibioticGroups: row.antibiotic_groups ?? [],
    otherGroups: row.other_groups ?? [],
    status: row.status,
    note: row.note ?? null,
    sourceLoadedAt: toIso(row.source_loaded_at),
    updatedAt: toIso(row.updated_at),
  };
}

export class PgPatientQueryRepository implements PatientQueryRepository {
  constructor(private readonly pool: Pool) {}

  async list(
    hospcode: string,
    query: PatientListQuery,
  ): Promise<Paginated<PatientListItem>> {
    const where: string[] = ['hospcode = $1'];
    const params: unknown[] = [hospcode];

    const add = (clause: (i: number) => string, value: unknown) => {
      params.push(value);
      where.push(clause(params.length));
    };

    if (query.status) add((i) => `status = $${i}`, query.status);
    if (query.diagcode) add((i) => `diagcode = $${i}`, query.diagcode);
    if (query.admitFrom) add((i) => `datetime_admit >= $${i}`, query.admitFrom);
    if (query.admitTo) add((i) => `datetime_admit <= $${i}`, query.admitTo);
    if (query.group) {
      // group อยู่ใน array ใดก็ได้ (nsaid/antibiotic/other)
      add(
        (i) =>
          `($${i} = ANY(nsaid_groups) OR $${i} = ANY(antibiotic_groups) OR $${i} = ANY(other_groups))`,
        query.group,
      );
    }
    if (query.q) {
      add(
        (i) => `(hn ILIKE $${i} OR pid ILIKE $${i})`,
        `%${query.q}%`,
      );
    }

    const whereSql = where.join(' AND ');

    const countRes = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM patient_drugallergy WHERE ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rowsRes = await this.pool.query<PdaRow>(
      `SELECT * FROM patient_drugallergy
       WHERE ${whereSql}
       ORDER BY updated_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    );

    return {
      items: rowsRes.rows.map((r) => toListItem(rowToRecord(r))),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async findById(
    hospcode: string,
    id: string,
  ): Promise<PatientDetail | null> {
    // id เป็น bigint → cast ปลอดภัย (invalid = คืน null ไม่ throw)
    if (!/^\d+$/.test(id)) return null;
    const res = await this.pool.query<PdaRow>(
      `SELECT * FROM patient_drugallergy WHERE id = $1 AND hospcode = $2 LIMIT 1`,
      [id, hospcode],
    );
    const row = res.rows[0];
    return row ? toDetail(rowToRecord(row)) : null;
  }
}
