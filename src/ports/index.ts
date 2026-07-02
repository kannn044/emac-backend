/**
 * Ports — สัญญา (interfaces) ทั้งหมดของระบบ ไม่มี implementation
 *
 * domain/service เรียกผ่าน interface เหล่านี้เท่านั้น ไม่รู้จัก pg / axios / KMS / Puppeteer
 * adapter (ภายใต้ src/adapters) เป็นผู้ implement และถูกประกอบเข้าที่ composition root
 *
 * Phase ถัดไปจะเติม method ลงในแต่ละ port ตามที่ workflow.md กำหนด
 * P0 ประกาศโครงไว้ก่อนเพื่อ lock ทิศพึ่งพา (dependency direction)
 */

// ---- Infrastructure primitives (ทำให้ logic deterministic + testable) ----

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  uuid(): string;
}

/** ตรวจสุขภาพ dependency หนึ่งตัว (db, cache, ฯลฯ) สำหรับ /readyz */
export interface HealthProbe {
  readonly name: string;
  check(): Promise<boolean>;
}

// ---- Domain-facing ports (เติมรายละเอียดใน Phase ที่เกี่ยวข้อง) ----

// NOTE: AuthProvider + KeyService นิยามเต็มที่ src/modules/auth/ports.ts (P2)
//       (คงรูปแบบเดียวกับ etl module ที่มี ports ของตัวเอง)

/** HIS vendor connector (manual ใน Phase 1, auto ภายหลัง) — P4+ */
export interface HisConnector {
  readonly kind: 'mock' | 'real';
  // getPatientAllergyHistory — เพิ่มเมื่อ integrate vendor
}

/** หมอพร้อม / patient consent — P6 */
export interface ConsentProvider {
  readonly kind: 'mock' | 'real';
  // verifyPatientIdentity / ... — เพิ่มใน P6
}

/** Domain events (in-process ก่อน; ต่อ async/national API ภายหลัง) */
export interface DomainEvent<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly occurredAt: Date;
}

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(type: string, handler: (e: DomainEvent) => Promise<void>): void;
}
