/**
 * Seed patients (mock) — ใช้กับ in-memory store (dev/demo/test) และ seed script (Postgres)
 * ~12 ราย หลากเคส (SJS/TEN, Allopurinol, NSAID, antibiotic ฯลฯ) + demographics ครบสำหรับพรีเซนต์
 * ส่วนใหญ่ hospcode 10670 (โปรไฟล์ demo) + บางส่วน 11292 (ทดสอบ tenant isolation)
 * สถานะส่วนใหญ่ pending เพื่อสาธิต verify → ออกบัตร; มี verified/rejected อย่างละ 1
 *
 * ⚠️ ข้อมูลบุคคลทั้งหมด (ชื่อ/CID/ที่อยู่) เป็น "ข้อมูลสมมติ" ที่สร้างขึ้นเพื่อสาธิตเท่านั้น
 *    ไม่ใช่ข้อมูลผู้ป่วยจริง — ใช้ PID/HN ขึ้นต้น MOCK- และไม่มี CID/วันเกิด เพื่อไม่ให้ดูเหมือนข้อมูลจริง
 *    ส่วนข้อมูลคลินิก (ยา/อาการ/biomarker) เป็นรูปแบบทางการแพทย์มาตรฐาน ไม่ผูกกับบุคคลใด
 */
import type { PatientRecord } from './types';

export const SEED_PATIENTS: PatientRecord[] = [
  {
    id: '1', hospcode: '10670', pid: 'MOCK-PID-001', cid: null, hn: 'MOCK-HN-001',
    fullName: 'ผู้ป่วยทดสอบ 001', sex: 'male', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L511', datetimeAdmit: '2026-06-12',
    suspectDrugs: [
      { didstd: '100001', dname: 'CARBAMAZEPINE 200 MG TABLET', dateServ: '2026-06-05', group: 'Carbamazepine' },
      { didstd: '100002', dname: 'PARACETAMOL 500 MG TABLET', dateServ: '2026-06-05', group: null },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: [], otherGroups: ['Carbamazepine'],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-13T02:00:00.000Z', updatedAt: '2026-06-13T02:00:00.000Z',
  },
  {
    id: '2', hospcode: '10670', pid: 'MOCK-PID-002', cid: null, hn: 'MOCK-HN-002',
    fullName: 'ผู้ป่วยทดสอบ 002', sex: 'female', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L512', datetimeAdmit: '2026-06-18',
    suspectDrugs: [
      { didstd: '100010', dname: 'ALLOPURINOL 300 MG TABLET', dateServ: '2026-06-01', group: 'Allopurinol' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: [], otherGroups: ['Allopurinol'],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-19T02:00:00.000Z', updatedAt: '2026-06-19T02:00:00.000Z',
  },
  {
    id: '3', hospcode: '10670', pid: 'MOCK-PID-003', cid: null, hn: 'MOCK-HN-003',
    fullName: 'ผู้ป่วยทดสอบ 003', sex: 'male', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L519', datetimeAdmit: '2026-06-20',
    suspectDrugs: [
      { didstd: '100020', dname: 'AMOXICILLIN 500 MG CAPSULE', dateServ: '2026-06-15', group: 'Penicillins' },
      { didstd: '100021', dname: 'IBUPROFEN 400 MG TABLET', dateServ: '2026-06-16', group: 'Ibuprofen' },
    ],
    nsaidGroups: ['Ibuprofen'], systemicNsaids: ['Ibuprofen'], antibioticGroups: ['Penicillins'], otherGroups: [],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-21T02:00:00.000Z', updatedAt: '2026-06-21T02:00:00.000Z',
  },
  {
    id: '4', hospcode: '10670', pid: 'MOCK-PID-004', cid: null, hn: 'MOCK-HN-004',
    fullName: 'ผู้ป่วยทดสอบ 004', sex: 'female', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L511', datetimeAdmit: '2026-05-28',
    suspectDrugs: [
      { didstd: '100030', dname: 'CO-TRIMOXAZOLE 960 MG TABLET', dateServ: '2026-05-20', group: 'Sulfonamides' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: ['Sulfonamides'], otherGroups: [],
    status: 'verified', note: 'ยืนยันจากประวัติเดิม',
    sourceLoadedAt: '2026-05-29T02:00:00.000Z', updatedAt: '2026-06-02T09:30:00.000Z',
  },
  {
    id: '5', hospcode: '10670', pid: 'MOCK-PID-005', cid: null, hn: 'MOCK-HN-005',
    fullName: 'ผู้ป่วยทดสอบ 005', sex: 'male', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L512', datetimeAdmit: '2026-06-22',
    suspectDrugs: [
      { didstd: '100040', dname: 'PHENYTOIN 100 MG CAPSULE', dateServ: '2026-06-10', group: 'Phenytoin' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: [], otherGroups: ['Phenytoin'],
    status: 'rejected', note: null,
    sourceLoadedAt: '2026-06-23T02:00:00.000Z', updatedAt: '2026-06-24T14:10:00.000Z',
  },
  {
    id: '6', hospcode: '10670', pid: 'MOCK-PID-006', cid: null, hn: 'MOCK-HN-006',
    fullName: 'ผู้ป่วยทดสอบ 006', sex: 'female', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L519', datetimeAdmit: '2026-06-25',
    suspectDrugs: [
      { didstd: '100050', dname: 'CEFTRIAXONE 1 G INJECTION', dateServ: '2026-06-24', group: 'Cephalosporins' },
      { didstd: '100051', dname: 'DICLOFENAC 25 MG TABLET', dateServ: '2026-06-24', group: 'Diclofenac' },
    ],
    nsaidGroups: ['Diclofenac'], systemicNsaids: ['Diclofenac'], antibioticGroups: ['Cephalosporins'], otherGroups: [],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-26T02:00:00.000Z', updatedAt: '2026-06-26T02:00:00.000Z',
  },
  {
    id: '7', hospcode: '10670', pid: 'MOCK-PID-007', cid: null, hn: 'MOCK-HN-007',
    fullName: 'ผู้ป่วยทดสอบ 007', sex: 'male', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L511', datetimeAdmit: '2026-06-27',
    suspectDrugs: [
      { didstd: '100011', dname: 'ALLOPURINOL 100 MG TABLET', dateServ: '2026-06-18', group: 'Allopurinol' },
      { didstd: '100070', dname: 'CIPROFLOXACIN 500 MG TABLET', dateServ: '2026-06-20', group: 'Fluoroquinolones' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: ['Fluoroquinolones'], otherGroups: ['Allopurinol'],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-28T02:00:00.000Z', updatedAt: '2026-06-28T02:00:00.000Z',
  },
  {
    id: '8', hospcode: '10670', pid: 'MOCK-PID-008', cid: null, hn: 'MOCK-HN-008',
    fullName: 'ผู้ป่วยทดสอบ 008', sex: 'female', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L512', datetimeAdmit: '2026-06-28',
    suspectDrugs: [
      { didstd: '100080', dname: 'PHENOBARBITAL 60 MG TABLET', dateServ: '2026-06-19', group: 'Phenobarbital' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: [], otherGroups: ['Phenobarbital'],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-29T02:00:00.000Z', updatedAt: '2026-06-29T02:00:00.000Z',
  },
  {
    id: '9', hospcode: '10670', pid: 'MOCK-PID-009', cid: null, hn: 'MOCK-HN-009',
    fullName: 'ผู้ป่วยทดสอบ 009', sex: 'male', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L519', datetimeAdmit: '2026-06-29',
    suspectDrugs: [
      { didstd: '100090', dname: 'PENICILLIN G SODIUM 1 MU INJECTION', dateServ: '2026-06-27', group: 'Penicillins' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: ['Penicillins'], otherGroups: [],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-30T02:00:00.000Z', updatedAt: '2026-06-30T02:00:00.000Z',
  },
  {
    id: '10', hospcode: '10670', pid: 'MOCK-PID-010', cid: null, hn: 'MOCK-HN-010',
    fullName: 'ผู้ป่วยทดสอบ 010', sex: 'female', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L511', datetimeAdmit: '2026-06-30',
    suspectDrugs: [
      { didstd: '100100', dname: 'MEFENAMIC ACID 500 MG CAPSULE', dateServ: '2026-06-26', group: 'Mefenamic acid' },
      { didstd: '100101', dname: 'CELECOXIB 200 MG CAPSULE', dateServ: '2026-06-26', group: 'Celecoxib' },
    ],
    nsaidGroups: ['Mefenamic acid', 'Celecoxib'], systemicNsaids: ['Mefenamic acid', 'Celecoxib'],
    antibioticGroups: [], otherGroups: [],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-07-01T02:00:00.000Z', updatedAt: '2026-07-01T02:00:00.000Z',
  },
  // ---- คนละโรงพยาบาล (11292) — ทดสอบ tenant isolation ----
  {
    id: '11', hospcode: '11292', pid: 'MOCK-PID-011', cid: null, hn: 'MOCK-HN-011',
    fullName: 'ผู้ป่วยทดสอบ 011', sex: 'male', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L511', datetimeAdmit: '2026-06-19',
    suspectDrugs: [
      { didstd: '100001', dname: 'CARBAMAZEPINE 200 MG TABLET', dateServ: '2026-06-10', group: 'Carbamazepine' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: [], otherGroups: ['Carbamazepine'],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-20T02:00:00.000Z', updatedAt: '2026-06-20T02:00:00.000Z',
  },
  {
    id: '12', hospcode: '11292', pid: 'MOCK-PID-012', cid: null, hn: 'MOCK-HN-012',
    fullName: 'ผู้ป่วยทดสอบ 012', sex: 'female', birthDate: null,
    address: 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง',
    diagcode: 'L512', datetimeAdmit: '2026-06-21',
    suspectDrugs: [
      { didstd: '100060', dname: 'VANCOMYCIN 1 G INJECTION', dateServ: '2026-06-20', group: 'Vancomycin' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: ['Vancomycin'], otherGroups: [],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-22T02:00:00.000Z', updatedAt: '2026-06-22T02:00:00.000Z',
  },
];

/** deep clone — กัน in-memory store แก้ค่าใน seed ต้นฉบับ */
export function seedPatients(): PatientRecord[] {
  return SEED_PATIENTS.map((p) => ({
    ...p,
    suspectDrugs: p.suspectDrugs.map((d) => ({ ...d })),
    nsaidGroups: [...p.nsaidGroups],
    systemicNsaids: [...p.systemicNsaids],
    antibioticGroups: [...p.antibioticGroups],
    otherGroups: [...p.otherGroups],
  }));
}
