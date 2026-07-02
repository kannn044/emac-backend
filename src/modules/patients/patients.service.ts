/**
 * PatientsService — list/detail ผู้ป่วยเฉพาะ รพ. ตน (workflow.md §5)
 * business logic ล้วน: บังคับ tenant scope จาก ctx + เขียน audit ตอนเปิด detail
 */
import { AppError } from '@/core/errors';
import type { Clock } from '@/ports/index';
import type { AuthContext } from '@/modules/auth/types';
import type {
  AuditLogRepository,
  PatientQueryRepository,
} from './ports';
import type {
  Paginated,
  PatientDetail,
  PatientListItem,
  PatientListQuery,
} from './types';

export class PatientsService {
  constructor(
    private readonly repo: PatientQueryRepository,
    private readonly audit: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  /** list — hospcode มาจาก ctx เท่านั้น (query ห้ามพก hospcode) */
  async list(
    ctx: AuthContext,
    query: PatientListQuery,
  ): Promise<Paginated<PatientListItem>> {
    return this.repo.list(ctx.hospcode, query);
  }

  /** detail — 404 ถ้าไม่ใช่ของ tenant ตน; เขียน audit VIEW */
  async getDetail(
    ctx: AuthContext,
    id: string,
    requestId?: string,
  ): Promise<PatientDetail> {
    const detail = await this.repo.findById(ctx.hospcode, id);
    if (!detail) {
      throw AppError.notFound('ไม่พบข้อมูลผู้ป่วย หรือไม่อยู่ในสิทธิ์ของโรงพยาบาลนี้');
    }
    await this.audit.record({
      action: 'VIEW',
      providerId: ctx.providerId,
      hospcode: ctx.hospcode,
      patientId: id,
      requestId,
    });
    return detail;
  }
}
