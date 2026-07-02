import { classifyDrug } from './classifier';
import { computeNaturalKey, normalizeDiagcode, toDateOnly } from './normalize';
import { EtlDrugRowSchema, type PatientAllergyRecord, type SuspectDrug } from './types';

export interface AggregateOptions {
  /** ถ้า true: ทิ้งแถวยาที่ DATE_SERV > admit (data quality guard) */
  dropDrugsAfterAdmit?: boolean;
}

export interface AggregateReport {
  records: PatientAllergyRecord[];
  rowsRead: number;
  rowsInvalid: number; // validate ไม่ผ่าน (zod/diagcode/date)
  rowsDropped: number; // ยาที่ถูกทิ้งด้วย guard
}

function uniq(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/**
 * แปลง drug-level rows (จาก ETL) → patient-level records พร้อม UPSERT
 *
 * จัดกลุ่มตาม (HOSPCODE, PID, DIAGCODE-normalized, DATETIME_ADMIT-date)
 * แต่ละกลุ่ม → 1 PatientAllergyRecord + suspect_drugs[] + กลุ่มยา (จาก classifier)
 *
 * row ที่ validate ไม่ผ่าน หรือ diagcode ไม่ใช่ L51% จะถูกข้าม (นับใน report)
 */
export function aggregateRows(
  rawRows: Record<string, unknown>[],
  options: AggregateOptions = {},
): AggregateReport {
  const dropAfterAdmit = options.dropDrugsAfterAdmit ?? true;
  const groups = new Map<
    string,
    {
      hospcode: string;
      pid: string;
      diagcode: string;
      datetimeAdmit: string;
      drugs: Map<string, SuspectDrug>; // dedupe ยาซ้ำด้วย key didstd|dateServ
    }
  >();

  let rowsInvalid = 0;
  let rowsDropped = 0;

  for (const raw of rawRows) {
    const parsed = EtlDrugRowSchema.safeParse(raw);
    if (!parsed.success) {
      rowsInvalid += 1;
      continue;
    }
    const row = parsed.data;

    const diagcode = normalizeDiagcode(row.DIAGCODE);
    if (!diagcode) {
      rowsInvalid += 1;
      continue;
    }

    let admitDate: string;
    let servDate: string;
    try {
      admitDate = toDateOnly(row.DATETIME_ADMIT);
      servDate = toDateOnly(row.DATE_SERV);
    } catch {
      rowsInvalid += 1;
      continue;
    }

    // guard: ยาที่ได้ "หลัง" admit ไม่ใช่สาเหตุการแพ้ย้อนหลัง → ทิ้ง
    if (dropAfterAdmit && servDate > admitDate) {
      rowsDropped += 1;
      continue;
    }

    const naturalKey = computeNaturalKey({
      hospcode: row.HOSPCODE,
      pid: row.PID,
      datetimeAdmit: admitDate,
      diagcode,
    });

    let group = groups.get(naturalKey);
    if (!group) {
      group = {
        hospcode: row.HOSPCODE.trim(),
        pid: row.PID.trim(),
        diagcode,
        datetimeAdmit: admitDate,
        drugs: new Map(),
      };
      groups.set(naturalKey, group);
    }

    const { group: drugGroup } = classifyDrug(row.DNAME);
    const drugKey = `${row.DIDSTD}|${servDate}`;
    if (!group.drugs.has(drugKey)) {
      group.drugs.set(drugKey, {
        didstd: row.DIDSTD.trim(),
        dname: row.DNAME.trim(),
        dateServ: servDate,
        group: drugGroup,
      });
    }
  }

  const records: PatientAllergyRecord[] = [];
  for (const [naturalKey, g] of groups) {
    const suspectDrugs = [...g.drugs.values()].sort((a, b) =>
      a.dateServ === b.dateServ
        ? a.didstd.localeCompare(b.didstd)
        : a.dateServ.localeCompare(b.dateServ),
    );

    const nsaid: string[] = [];
    const systemicNsaid: string[] = [];
    const antibiotic: string[] = [];
    const other: string[] = [];

    for (const d of suspectDrugs) {
      const c = classifyDrug(d.dname);
      if (!c.group || !c.bucket) continue;
      if (c.bucket === 'nsaid') {
        nsaid.push(c.group);
        if (c.systemic) systemicNsaid.push(c.group);
      } else if (c.bucket === 'antibiotic') {
        antibiotic.push(c.group);
      } else {
        other.push(c.group);
      }
    }

    records.push({
      naturalKey,
      hospcode: g.hospcode,
      pid: g.pid,
      diagcode: g.diagcode,
      datetimeAdmit: g.datetimeAdmit,
      suspectDrugs,
      nsaidGroups: uniq(nsaid),
      systemicNsaids: uniq(systemicNsaid),
      antibioticGroups: uniq(antibiotic),
      otherGroups: uniq(other),
    });
  }

  // เรียงผลลัพธ์ให้ deterministic (ง่ายต่อ test)
  records.sort((a, b) => a.naturalKey.localeCompare(b.naturalKey));

  return {
    records,
    rowsRead: rawRows.length,
    rowsInvalid,
    rowsDropped,
  };
}
