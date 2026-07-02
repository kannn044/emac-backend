/**
 * Seed patients (mock) — ใช้กับ in-memory store (dev/demo/test) และ seed script (Postgres)
 * ~12 ราย หลากเคส (SJS/TEN, Allopurinol, NSAID, antibiotic ฯลฯ) + demographics ครบสำหรับพรีเซนต์
 * ส่วนใหญ่ hospcode 10670 (โปรไฟล์ demo) + บางส่วน 11292 (ทดสอบ tenant isolation)
 * สถานะส่วนใหญ่ pending เพื่อสาธิต verify → ออกบัตร; มี verified/rejected อย่างละ 1
 */
import type { PatientRecord } from './types';

export const SEED_PATIENTS: PatientRecord[] = [
  {
    id: '1', hospcode: '10670', pid: '00012345', cid: '1100701234567', hn: 'HN-2026-0001',
    fullName: 'นายสมชาย เทวกุล', sex: 'male', birthDate: '1975-03-14',
    address: '128/5 ถ.พรานนก แขวงศิริราช เขตบางกอกน้อย กรุงเทพฯ 10700',
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
    id: '2', hospcode: '10670', pid: '00023456', cid: '1100702345678', hn: 'HN-2026-0002',
    fullName: 'นางสาวปิยะนุช อินทร์แก้ว', sex: 'female', birthDate: '1990-11-02',
    address: '55 หมู่ 4 ต.บางกร่าง อ.เมือง จ.นนทบุรี 11000',
    diagcode: 'L512', datetimeAdmit: '2026-06-18',
    suspectDrugs: [
      { didstd: '100010', dname: 'ALLOPURINOL 300 MG TABLET', dateServ: '2026-06-01', group: 'Allopurinol' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: [], otherGroups: ['Allopurinol'],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-19T02:00:00.000Z', updatedAt: '2026-06-19T02:00:00.000Z',
  },
  {
    id: '3', hospcode: '10670', pid: '00034567', cid: '1100703456789', hn: 'HN-2026-0003',
    fullName: 'เด็กชายกิตติภพ ศรีสุข', sex: 'male', birthDate: '2015-07-21',
    address: '9/1 ซ.จรัญสนิทวงศ์ 13 แขวงวัดท่าพระ เขตบางกอกใหญ่ กรุงเทพฯ 10600',
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
    id: '4', hospcode: '10670', pid: '00045678', cid: '1100704567890', hn: 'HN-2026-0004',
    fullName: 'นางมาลี วงศ์ทอง', sex: 'female', birthDate: '1962-01-30',
    address: '212 ถ.อิสรภาพ แขวงบ้านช่างหล่อ เขตบางกอกน้อย กรุงเทพฯ 10700',
    diagcode: 'L511', datetimeAdmit: '2026-05-28',
    suspectDrugs: [
      { didstd: '100030', dname: 'CO-TRIMOXAZOLE 960 MG TABLET', dateServ: '2026-05-20', group: 'Sulfonamides' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: ['Sulfonamides'], otherGroups: [],
    status: 'verified', note: 'ยืนยันจากประวัติเดิม',
    sourceLoadedAt: '2026-05-29T02:00:00.000Z', updatedAt: '2026-06-02T09:30:00.000Z',
  },
  {
    id: '5', hospcode: '10670', pid: '00056789', cid: '1100705678901', hn: 'HN-2026-0005',
    fullName: 'นายอนุชา ตันติวงศ์', sex: 'male', birthDate: '1983-09-09',
    address: '77/12 ถ.เจริญกรุง แขวงยานนาวา เขตสาทร กรุงเทพฯ 10120',
    diagcode: 'L512', datetimeAdmit: '2026-06-22',
    suspectDrugs: [
      { didstd: '100040', dname: 'PHENYTOIN 100 MG CAPSULE', dateServ: '2026-06-10', group: 'Phenytoin' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: [], otherGroups: ['Phenytoin'],
    status: 'rejected', note: null,
    sourceLoadedAt: '2026-06-23T02:00:00.000Z', updatedAt: '2026-06-24T14:10:00.000Z',
  },
  {
    id: '6', hospcode: '10670', pid: '00067890', cid: '1100706789012', hn: 'HN-2026-0006',
    fullName: 'นางสาวศิริพร แสงจันทร์', sex: 'female', birthDate: '1998-05-17',
    address: '43 หมู่ 2 ต.ศาลายา อ.พุทธมณฑล จ.นครปฐม 73170',
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
    id: '7', hospcode: '10670', pid: '00078901', cid: '1100707890123', hn: 'HN-2026-0007',
    fullName: 'นายประเสริฐ บุญมา', sex: 'male', birthDate: '1957-12-05',
    address: '5/89 ถ.บรมราชชนนี แขวงอรุณอมรินทร์ เขตบางกอกน้อย กรุงเทพฯ 10700',
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
    id: '8', hospcode: '10670', pid: '00089012', cid: '1100708901234', hn: 'HN-2026-0008',
    fullName: 'นางกนกวรรณ พูนสิน', sex: 'female', birthDate: '1971-08-25',
    address: '19 ซ.สุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพฯ 10110',
    diagcode: 'L512', datetimeAdmit: '2026-06-28',
    suspectDrugs: [
      { didstd: '100080', dname: 'PHENOBARBITAL 60 MG TABLET', dateServ: '2026-06-19', group: 'Phenobarbital' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: [], otherGroups: ['Phenobarbital'],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-29T02:00:00.000Z', updatedAt: '2026-06-29T02:00:00.000Z',
  },
  {
    id: '9', hospcode: '10670', pid: '00090123', cid: '1100709012345', hn: 'HN-2026-0009',
    fullName: 'นายวีรภัทร จันทโชติ', sex: 'male', birthDate: '2001-02-11',
    address: '88/8 ถ.ประชาราษฎร์ สาย 1 แขวงบางซื่อ เขตบางซื่อ กรุงเทพฯ 10800',
    diagcode: 'L519', datetimeAdmit: '2026-06-29',
    suspectDrugs: [
      { didstd: '100090', dname: 'PENICILLIN G SODIUM 1 MU INJECTION', dateServ: '2026-06-27', group: 'Penicillins' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: ['Penicillins'], otherGroups: [],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-30T02:00:00.000Z', updatedAt: '2026-06-30T02:00:00.000Z',
  },
  {
    id: '10', hospcode: '10670', pid: '00101234', cid: '1100710123456', hn: 'HN-2026-0010',
    fullName: 'นางสาวธัญชนก เรืองศรี', sex: 'female', birthDate: '1995-06-30',
    address: '3/45 ถ.ราชวิถี แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพฯ 10400',
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
    id: '11', hospcode: '11292', pid: '00111234', cid: '1129201112345', hn: 'CM-2026-0101',
    fullName: 'นายบุญส่ง คำแก้ว', sex: 'male', birthDate: '1968-04-18',
    address: '210 ถ.สุเทพ ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200',
    diagcode: 'L511', datetimeAdmit: '2026-06-19',
    suspectDrugs: [
      { didstd: '100001', dname: 'CARBAMAZEPINE 200 MG TABLET', dateServ: '2026-06-10', group: 'Carbamazepine' },
    ],
    nsaidGroups: [], systemicNsaids: [], antibioticGroups: [], otherGroups: ['Carbamazepine'],
    status: 'pending', note: null,
    sourceLoadedAt: '2026-06-20T02:00:00.000Z', updatedAt: '2026-06-20T02:00:00.000Z',
  },
  {
    id: '12', hospcode: '11292', pid: '00121234', cid: '1129201212345', hn: 'CM-2026-0102',
    fullName: 'นางเพ็ญนภา ไชยวงศ์', sex: 'female', birthDate: '1979-10-12',
    address: '66 หมู่ 6 ต.ช้างเผือก อ.เมือง จ.เชียงใหม่ 50300',
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
