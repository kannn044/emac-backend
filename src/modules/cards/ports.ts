/**
 * Cards module ports — เก็บ/ดึงบัตร
 * findById / findByRenderToken เป็น PUBLIC (ไม่ผูก tenant) เพราะใช้กับ verify/embed สาธารณะ
 * findByPatient เป็น tenant-scoped (ให้ frontend ของ รพ. ดึงบัตรของ record ตน)
 */
import type { AllergyCard } from './types';

export interface CardRepository {
  save(card: AllergyCard): Promise<AllergyCard>;
  findById(id: string): Promise<AllergyCard | null>;
  findByRenderToken(token: string): Promise<AllergyCard | null>;
  findByPatient(hospcode: string, patientId: string): Promise<AllergyCard | null>;
}
