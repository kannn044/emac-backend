/**
 * In-memory adapters (dev/demo/test) — ไม่ต้องมี Postgres
 *   - InMemoryPatientQueryRepository : list/detail (อ่านอย่างเดียว)
 *   - InMemoryPatientStore           : อ่าน + เขียน (verify/reject/note) บน records ชุดเดียว
 *   - InMemoryAuditLogRepository     : audit ใน array
 * semantics เดียวกับ Postgres: tenant scope + filter + paging + state machine
 */
import { AppError } from '@/core/errors';
import type {
  AuditEntry,
  AuditLogRepository,
  PatientQueryRepository,
} from '@/modules/patients/ports';
import type {
  Paginated,
  PatientDetail,
  PatientListItem,
  PatientListQuery,
  PatientRecord,
} from '@/modules/patients/types';
import { toDetail, toListItem, unionGroups } from '@/modules/patients/mapper';
import { seedPatients } from '@/modules/patients/fixtures';
import type {
  NewRejection,
  NewVerification,
  VerificationRepository,
} from '@/modules/verification/ports';
import type { VerificationRecord } from '@/modules/verification/types';

/** filter + paging ร่วม (ใช้ทั้ง query repo และ store) */
function filterAndPage(
  records: PatientRecord[],
  hospcode: string,
  query: PatientListQuery,
): Paginated<PatientListItem> {
  const q = query.q?.trim().toLowerCase();
  const filtered = records
    .filter((r) => r.hospcode === hospcode)
    .filter((r) => (query.status ? r.status === query.status : true))
    .filter((r) => (query.diagcode ? r.diagcode === query.diagcode : true))
    .filter((r) => (query.admitFrom ? r.datetimeAdmit >= query.admitFrom : true))
    .filter((r) => (query.admitTo ? r.datetimeAdmit <= query.admitTo : true))
    .filter((r) => (query.group ? unionGroups(r).includes(query.group) : true))
    .filter((r) => {
      if (!q) return true;
      return (
        (r.hn?.toLowerCase().includes(q) ?? false) ||
        r.pid.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const total = filtered.length;
  const start = (query.page - 1) * query.pageSize;
  const items = filtered.slice(start, start + query.pageSize).map(toListItem);
  return { items, page: query.page, pageSize: query.pageSize, total };
}

export class InMemoryPatientQueryRepository implements PatientQueryRepository {
  protected readonly records: PatientRecord[];

  constructor(records: PatientRecord[] = seedPatients()) {
    this.records = records;
  }

  async list(
    hospcode: string,
    query: PatientListQuery,
  ): Promise<Paginated<PatientListItem>> {
    return filterAndPage(this.records, hospcode, query);
  }

  async findById(
    hospcode: string,
    id: string,
  ): Promise<PatientDetail | null> {
    const rec = this.records.find(
      (r) => r.id === id && r.hospcode === hospcode,
    );
    return rec ? toDetail(rec) : null;
  }
}

interface StoredRejection extends NewRejection {
  createdAt: string;
}

/**
 * Unified store — read + write บน records ชุดเดียว
 * ใช้เป็นทั้ง patientRepo และ verificationRepo ใน container (memory mode)
 * → verify แล้วสถานะสะท้อนใน list ทันที
 */
export class InMemoryPatientStore
  extends InMemoryPatientQueryRepository
  implements VerificationRepository
{
  private readonly verifications = new Map<string, VerificationRecord>();
  readonly rejections: StoredRejection[] = [];
  private seq = 1;

  private findRecord(
    hospcode: string,
    patientId: string,
  ): PatientRecord | undefined {
    return this.records.find(
      (r) => r.id === patientId && r.hospcode === hospcode,
    );
  }

  async getByPatient(
    hospcode: string,
    patientId: string,
  ): Promise<VerificationRecord | null> {
    const v = this.verifications.get(patientId);
    return v && v.hospcode === hospcode ? v : null;
  }

  async saveVerified(v: NewVerification): Promise<VerificationRecord> {
    const rec = this.findRecord(v.hospcode, v.patientId);
    if (!rec) throw AppError.notFound('ไม่พบข้อมูลผู้ป่วย');
    if (rec.status !== 'pending') {
      throw AppError.conflict('record นี้ถูกดำเนินการแล้ว (read-only)');
    }
    const record: VerificationRecord = {
      id: String(this.seq++),
      decision: 'verified',
      ...v,
    };
    this.verifications.set(v.patientId, record);
    rec.status = 'verified';
    rec.note = v.note;
    rec.updatedAt = v.signedAt;
    return record;
  }

  async saveRejected(r: NewRejection): Promise<void> {
    const rec = this.findRecord(r.hospcode, r.patientId);
    if (!rec) throw AppError.notFound('ไม่พบข้อมูลผู้ป่วย');
    if (rec.status !== 'pending') {
      throw AppError.conflict('record นี้ถูกดำเนินการแล้ว (read-only)');
    }
    this.rejections.push({ ...r, createdAt: new Date().toISOString() });
    rec.status = 'rejected';
    rec.updatedAt = new Date().toISOString();
  }

  async updateNote(
    hospcode: string,
    patientId: string,
    note: string,
  ): Promise<void> {
    const rec = this.findRecord(hospcode, patientId);
    if (!rec) throw AppError.notFound('ไม่พบข้อมูลผู้ป่วย');
    if (rec.status !== 'pending') {
      throw AppError.conflict('แก้ note ได้เฉพาะก่อนยืนยัน');
    }
    rec.note = note;
  }
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
