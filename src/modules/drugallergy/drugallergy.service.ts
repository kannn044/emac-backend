/**
 * DrugAllergyService — ค้นประวัติแพ้ยาตาม CID พร้อมคุมโควตารายวันต่อ client
 *
 * flow:
 *   1. อ่านโควตาที่ใช้ไปแล้ววันนี้ (ICT) → remaining
 *   2. remaining <= 0 → คืน records ว่าง + truncated (ถ้ามี cid ส่งมา)
 *   3. query parquet (DuckDB) ได้สูงสุด remaining+1 แถว
 *   4. reserve โควตาแบบ atomic (กัน race หลาย request พร้อมกัน) → granted
 *   5. คืน records เท่าที่ granted + truncated ถ้าถูกตัด
 *
 * ไม่รู้จัก express/duckdb/pg — เรียกผ่าน port เท่านั้น
 */
import { AppError } from '@/core/errors';
import type { Clock } from '@/ports/index';
import type { AllergySource, AllergyQuotaStore } from './ports';
import type {
  AllergySearchResult,
  AllergySearchOneResult,
  QuotaStatus,
} from './types';
import { ictQuotaDate, ictNextResetAt } from './quota-clock';

export interface SearchParams {
  cids: string[];
  clientKey: string; // hospcode ของผู้เรียก (จาก session)
}

export interface SearchOneParams {
  cid: string;
  clientKey: string; // hospcode ของผู้เรียก (จาก session)
}

export class DrugAllergyService {
  constructor(
    private readonly source: AllergySource,
    private readonly quota: AllergyQuotaStore,
    private readonly clock: Clock,
    private readonly dailyLimit: number,
    private readonly maxCidsPerRequest: number,
  ) {}

  /**
   * ค้นประวัติแพ้ยาตาม CID เดียว → คืนทุกคอลัมน์ยกเว้น HOSPCODE, PID, CID
   * (endpoint ที่เปิดใช้จริงตอนนี้)
   */
  async searchOne(params: SearchOneParams): Promise<AllergySearchOneResult> {
    const cid = String(params.cid ?? '').trim();
    if (!cid) {
      throw AppError.badRequest('ต้องส่ง cid');
    }
    return this.runWithQuota(params.clientKey, (limit) =>
      this.source.queryOneRaw(cid, limit),
    );
  }

  /**
   * (ยังไม่เปิดใช้ — multi-CID สำหรับอนาคต) ค้นตาม CID list
   */
  async search(params: SearchParams): Promise<AllergySearchResult> {
    const cids = normalizeCids(params.cids);
    if (cids.length === 0) {
      throw AppError.badRequest('ต้องส่ง cids อย่างน้อย 1 รายการ');
    }
    if (cids.length > this.maxCidsPerRequest) {
      throw AppError.badRequest(
        `cids เกินจำนวนสูงสุด (${this.maxCidsPerRequest} ต่อ request)`,
      );
    }
    return this.runWithQuota(params.clientKey, (limit) =>
      this.source.queryByCids(cids, limit),
    );
  }

  /**
   * รัน query ภายใต้โควตารายวัน — คุมโควตา, ดึง remaining+1 เพื่อรู้ truncated,
   * reserve แบบ atomic (กัน race), ตัดผลตามโควตาที่ได้จริง
   */
  private async runWithQuota<T>(
    clientKey: string,
    fetch: (limit: number) => Promise<T[]>,
  ): Promise<{ records: T[]; count: number; truncated: boolean; quota: QuotaStatus }> {
    const now = this.clock.now();
    const quotaDate = ictQuotaDate(now);

    const used = await this.quota.peek(clientKey, quotaDate);
    const remaining = Math.max(0, this.dailyLimit - used);

    if (remaining <= 0) {
      // โควตาหมด — คืนว่าง + แจ้ง truncated (ยังมีข้อมูลแต่ดึงไม่ได้)
      return this.envelope([], true, used, now);
    }

    // ดึง remaining+1 เพื่อรู้ว่ามีเกินโควตาไหม
    const rows = await fetch(remaining + 1);
    const matched = rows.length;
    const want = Math.min(matched, remaining);

    if (want === 0) {
      return this.envelope([], false, used, now);
    }

    const { granted, usedAfter } = await this.quota.reserve(
      clientKey,
      quotaDate,
      want,
      this.dailyLimit,
    );

    const records = rows.slice(0, granted);
    const truncated = matched > granted;
    return this.envelope(records, truncated, usedAfter, now);
  }

  private envelope<T>(
    records: T[],
    truncated: boolean,
    used: number,
    now: Date,
  ): { records: T[]; count: number; truncated: boolean; quota: QuotaStatus } {
    const quota: QuotaStatus = {
      limit: this.dailyLimit,
      used,
      remaining: Math.max(0, this.dailyLimit - used),
      resetAt: ictNextResetAt(now),
    };
    return { records, count: records.length, truncated, quota };
  }
}

/** trim + ตัดค่าว่าง + dedup (คงลำดับแรกพบ) */
export function normalizeCids(cids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cids) {
    const c = String(raw ?? '').trim();
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}
