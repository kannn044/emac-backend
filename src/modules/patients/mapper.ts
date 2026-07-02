/**
 * Mapping helpers — PatientRecord (domain) → DTO (list item / detail)
 * ใช้ร่วมทั้ง in-memory repo และ Postgres repo (map จาก row)
 */
import type { PatientDetail, PatientListItem, PatientRecord } from './types';

/** รวมกลุ่มยาทุกชนิดเป็น list เดียว (ไม่ซ้ำ) สำหรับโชว์ chip */
export function unionGroups(r: PatientRecord): string[] {
  return [
    ...new Set([...r.nsaidGroups, ...r.antibioticGroups, ...r.otherGroups]),
  ];
}

export function toListItem(r: PatientRecord): PatientListItem {
  return {
    id: r.id,
    hn: r.hn,
    pid: r.pid,
    fullName: r.fullName,
    sex: r.sex,
    diagcode: r.diagcode,
    datetimeAdmit: r.datetimeAdmit,
    status: r.status,
    drugCount: r.suspectDrugs.length,
    groups: unionGroups(r),
    updatedAt: r.updatedAt,
  };
}

export function toDetail(r: PatientRecord): PatientDetail {
  return {
    ...toListItem(r),
    cid: r.cid,
    birthDate: r.birthDate,
    address: r.address,
    suspectDrugs: r.suspectDrugs,
    nsaidGroups: r.nsaidGroups,
    systemicNsaids: r.systemicNsaids,
    antibioticGroups: r.antibioticGroups,
    otherGroups: r.otherGroups,
    note: r.note,
    sourceHospcode: r.hospcode,
    sourceLoadedAt: r.sourceLoadedAt,
  };
}
