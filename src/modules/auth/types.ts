/**
 * Auth domain types — ใช้ร่วมกันทั้ง provider adapter, service, middleware
 */

/** role ที่ระบบรองรับ (จาก MOPH api/info → map เป็น role ภายใน) */
export type Role = 'doctor' | 'pharmacist';

export const ALLOWED_ROLES: readonly Role[] = ['doctor', 'pharmacist'];

/**
 * ProviderInfo — ผลลัพธ์หลัง authenticate กับ MOPH Provider ID (api/info)
 * mock adapter สร้างจาก seed; real adapter ดึงจาก GET {provider}/api/info
 */
export interface ProviderInfo {
  providerId: string; // sub (MOPH provider id) — คงที่ต่อคน
  name: string;
  position: string; // ตำแหน่ง/วิชาชีพจาก api/info
  license: string; // เลขใบประกอบวิชาชีพ
  hospcode: string; // 5 หลัก — tenant key
  hospitalName: string;
  role: Role;
  isMedicalPersonnel: boolean; // true = บุคลากรการแพทย์จริง (เงื่อนไขออก session)
}

/** claims ใน session JWT ของระบบเรา */
export interface SessionClaims {
  sub: string; // providerId
  hospcode: string;
  hospitalName: string;
  role: Role;
  name: string;
  keyId: string; // key ที่ enroll ไว้ (ใช้ตอน sign ใน P4)
  iat: number; // seconds
  exp: number; // seconds
}

/** context ที่ middleware แนบเข้า req หลังตรวจ session แล้ว */
export interface AuthContext {
  providerId: string;
  hospcode: string;
  hospitalName: string;
  role: Role;
  name: string;
  keyId: string;
}
