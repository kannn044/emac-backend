/**
 * Drug allergy module ports — service เรียกผ่าน interface เท่านั้น
 * สลับ DuckDB/parquet ↔ mock, Postgres ↔ in-memory quota โดยไม่แตะ business logic
 */
import type { AllergyRecord } from './types';

/**
 * แหล่งข้อมูลประวัติแพ้ยา (อ่านจากไฟล์ parquet ด้วย DuckDB)
 * query CID หลายตัวพร้อมกัน (IN) — คืนได้สูงสุด `limit` แถว
 */
export interface AllergySource {
  /**
   * (ยังไม่เปิดใช้ — สำหรับ multi-CID ในอนาคต) ค้นหา record ตาม CID list
   * @param cids  รายการ CID (dedup แล้ว)
   * @param limit จำนวนแถวสูงสุดที่จะดึง (เพื่อคุมโควตา) — ดึง limit+1 ภายในเพื่อรู้ว่ามีเกินไหม
   * @returns rows (สูงสุด limit+1 แถว) เพื่อให้ service ตัดสิน truncated เอง
   */
  queryByCids(cids: string[], limit: number): Promise<AllergyRecord[]>;

  /**
   * ค้นหา record ตาม CID เดียว → คืน "ทุกคอลัมน์ใน parquet ยกเว้น HOSPCODE, PID, CID"
   * (คอลัมน์ตามชื่อจริงในไฟล์ parquet — รองรับคอลัมน์ใหม่อัตโนมัติถ้าไฟล์เพิ่ม)
   * @returns rows (สูงสุด limit+1 แถว) เป็น Record ดิบ (ค่าเป็น string|null)
   */
  queryOneRaw(cid: string, limit: number): Promise<Record<string, string | null>[]>;

  /**
   * (service/M2M) ค้นตาม CID เดียว → คืน **ทุกคอลัมน์** ในไฟล์ parquet (รวม HOSPCODE, PID, CID)
   * ใช้กับ endpoint ภายในที่ auth ด้วย IP+API key
   */
  queryOneFullRaw(cid: string, limit: number): Promise<Record<string, string | null>[]>;
}

/** 1 บรรทัด access log ของ endpoint ดึงข้อมูลแพ้ยา (search + lookup, ตารางเดียวกัน) */
export interface ServiceAccessLogEntry {
  channel: 'search' | 'lookup';
  providerId: string | null; // search: providerId ของเภสัช (จาก session)
  hospcode: string | null; // search: รพ.
  clientIp: string | null; // lookup: IP ผู้เรียก
  apiKeyId: string | null; // lookup: fingerprint สั้นของ key (ไม่เก็บ key จริง)
  cid: string | null; // CID ที่ค้น (ดิบ)
  resultCount: number;
  status: number; // HTTP status
  requestId: string | null;
}

/** ที่เก็บ access log ของ service endpoint (Postgres / in-memory) */
export interface ServiceAccessLogRepository {
  record(entry: ServiceAccessLogEntry): Promise<void>;
}

/**
 * ตัวนับโควตารายวันต่อ client (atomic)
 * quotaDate = วันที่เขต ICT (YYYY-MM-DD) — reset เที่ยงคืนเวลาไทย
 */
export interface AllergyQuotaStore {
  /** อ่านจำนวนที่ใช้ไปแล้วของ client ในวันนั้น (0 ถ้ายังไม่มี) */
  peek(clientKey: string, quotaDate: string): Promise<number>;

  /**
   * เพิ่มการใช้โควตาแบบ atomic โดยไม่ให้เกิน limit
   * @returns granted = จำนวนที่เพิ่มได้จริง (<= want), usedAfter = ยอดรวมหลังเพิ่ม
   */
  reserve(
    clientKey: string,
    quotaDate: string,
    want: number,
    limit: number,
  ): Promise<{ granted: number; usedAfter: number }>;
}
