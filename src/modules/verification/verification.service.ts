/**
 * VerificationService (workflow.md §6) — หัวใจระบบ
 *   verify: เลือก confirmed_drugs + กรอกคลินิก → canonical payload → sign → บันทึก + set verified
 *   reject / note / preview
 *
 * state machine: pending → verified | rejected ; verified/rejected = read-only
 * business logic ล้วน — เรียกผ่าน port (repo/keys/audit) ไม่รู้จัก pg/crypto ตรง ๆ
 */
import { AppError } from '@/core/errors';
import type { Clock } from '@/ports/index';
import type { AuthContext } from '@/modules/auth/types';
import type { KeyService } from '@/modules/auth/ports';
import type {
  AuditLogRepository,
  PatientQueryRepository,
} from '@/modules/patients/ports';
import type { PatientDetail } from '@/modules/patients/types';
import type { VerificationRepository } from './ports';
import type {
  CardPreview,
  VerificationRecord,
  VerificationSignPayload,
  VerifyInput,
} from './types';
import { canonicalize } from './canonical';
import type { CardService } from '@/modules/cards/cards.service';
import type { AllergyCard } from '@/modules/cards/types';

export interface VerifyResult {
  verification: VerificationRecord;
  card: AllergyCard;
}

export class VerificationService {
  constructor(
    private readonly patients: PatientQueryRepository,
    private readonly repo: VerificationRepository,
    private readonly keys: KeyService,
    private readonly audit: AuditLogRepository,
    private readonly clock: Clock,
    private readonly cards: CardService,
  ) {}

  /** โหลด patient เฉพาะ tenant (404 ถ้าไม่พบ) */
  private async load(ctx: AuthContext, id: string): Promise<PatientDetail> {
    const detail = await this.patients.findById(ctx.hospcode, id);
    if (!detail) {
      throw AppError.notFound('ไม่พบข้อมูลผู้ป่วย หรือไม่อยู่ในสิทธิ์ของโรงพยาบาลนี้');
    }
    return detail;
  }

  /** ตรวจว่า confirmedDrugs เป็น subset ของ suspect_drugs (อ้าง didstd) */
  private assertSubset(detail: PatientDetail, input: VerifyInput): void {
    if (input.confirmedDrugs.length === 0) {
      throw AppError.unprocessable('ต้องเลือกยาที่ยืนยันอย่างน้อย 1 รายการ');
    }
    const suspectIds = new Set(detail.suspectDrugs.map((d) => d.didstd));
    const invalid = input.confirmedDrugs.filter((d) => !suspectIds.has(d.didstd));
    if (invalid.length > 0) {
      throw AppError.unprocessable('ยาที่ยืนยันต้องอยู่ในรายการยาที่ต้องสงสัยเท่านั้น', {
        invalid: invalid.map((d) => d.didstd),
      });
    }
  }

  async verify(
    ctx: AuthContext,
    id: string,
    input: VerifyInput,
    requestId?: string,
  ): Promise<VerifyResult> {
    const detail = await this.load(ctx, id);
    if (detail.status !== 'pending') {
      throw AppError.conflict('record นี้ถูกดำเนินการแล้ว (read-only)');
    }
    this.assertSubset(detail, input);

    const signedAt = this.clock.now().toISOString();
    const signPayload: VerificationSignPayload = {
      patientId: detail.id,
      hospcode: detail.sourceHospcode,
      pid: detail.pid,
      cid: detail.cid,
      diagcode: detail.diagcode,
      datetimeAdmit: detail.datetimeAdmit,
      confirmedDrugs: input.confirmedDrugs,
      biomarker: input.biomarker ?? null,
      severity: input.severity,
      manifestations: input.manifestations,
      crossReactiveDrugs: input.crossReactiveDrugs,
      alternativeDrugs: input.alternativeDrugs,
      providerId: ctx.providerId,
      signedAt,
    };
    const canonicalPayload = canonicalize(signPayload);
    const signature = await this.keys.sign(ctx.keyId, canonicalPayload);

    const record = await this.repo.saveVerified({
      patientId: detail.id,
      providerId: ctx.providerId,
      hospcode: ctx.hospcode,
      confirmedDrugs: input.confirmedDrugs,
      biomarker: input.biomarker ?? null,
      severity: input.severity,
      manifestations: input.manifestations,
      crossReactiveDrugs: input.crossReactiveDrugs,
      alternativeDrugs: input.alternativeDrugs,
      note: input.note ?? null,
      canonicalPayload,
      signature,
      signatureAlg: 'Ed25519',
      keyId: ctx.keyId,
      signedAt,
    });

    // ออกบัตร (immutable) จาก decision ที่ลงนามแล้ว — P5
    const card = await this.cards.issueForVerification({
      patient: detail,
      verification: record,
      providerName: ctx.name,
      hospitalName: ctx.hospitalName,
    });

    await this.audit.record({
      action: 'STAMP',
      providerId: ctx.providerId,
      hospcode: ctx.hospcode,
      patientId: detail.id,
      requestId,
      detail: { confirmed: input.confirmedDrugs.length, cardId: card.id },
    });

    return { verification: record, card };
  }

  async reject(
    ctx: AuthContext,
    id: string,
    reason: string,
    requestId?: string,
  ): Promise<void> {
    const detail = await this.load(ctx, id);
    if (detail.status !== 'pending') {
      throw AppError.conflict('record นี้ถูกดำเนินการแล้ว (read-only)');
    }
    await this.repo.saveRejected({
      patientId: detail.id,
      providerId: ctx.providerId,
      hospcode: ctx.hospcode,
      reason,
      snapshot: detail as unknown as Record<string, unknown>,
    });
    await this.audit.record({
      action: 'REJECT',
      providerId: ctx.providerId,
      hospcode: ctx.hospcode,
      patientId: detail.id,
      requestId,
      detail: { reason },
    });
  }

  async updateNote(
    ctx: AuthContext,
    id: string,
    note: string,
    requestId?: string,
  ): Promise<void> {
    const detail = await this.load(ctx, id);
    if (detail.status !== 'pending') {
      throw AppError.conflict('แก้ note ได้เฉพาะก่อนยืนยัน (record ถูก stamp แล้ว)');
    }
    await this.repo.updateNote(ctx.hospcode, detail.id, note);
    await this.audit.record({
      action: 'EDIT',
      providerId: ctx.providerId,
      hospcode: ctx.hospcode,
      patientId: detail.id,
      requestId,
    });
  }

  /** render preview โดยไม่บันทึก (full template/PDF = P5) */
  async previewCard(
    ctx: AuthContext,
    id: string,
    input: VerifyInput,
  ): Promise<CardPreview> {
    const detail = await this.load(ctx, id);
    this.assertSubset(detail, input);
    const drugs = input.confirmedDrugs.map((d) => d.dname).join(', ');
    const cross = input.crossReactiveDrugs.join(', ') || '-';
    const alt = input.alternativeDrugs.join(', ') || '-';
    const html = [
      '<div class="emac-card-preview">',
      `<h3>บัตรแพ้ยา (พรีวิว) — ${detail.hn ?? detail.pid}</h3>`,
      `<p><b>ยาที่แพ้:</b> ${drugs}</p>`,
      `<p><b>ความรุนแรง:</b> ${input.severity}</p>`,
      input.biomarker ? `<p><b>Biomarker:</b> ${input.biomarker}</p>` : '',
      `<p><b>ห้ามใช้ (cross-reactive):</b> ${cross}</p>`,
      `<p><b>ยาทางเลือก:</b> ${alt}</p>`,
      '</div>',
    ].join('');

    return {
      patientId: detail.id,
      hn: detail.hn,
      pid: detail.pid,
      hospcode: detail.sourceHospcode,
      diagcode: detail.diagcode,
      confirmedDrugs: input.confirmedDrugs,
      biomarker: input.biomarker ?? null,
      severity: input.severity,
      manifestations: input.manifestations,
      crossReactiveDrugs: input.crossReactiveDrugs,
      alternativeDrugs: input.alternativeDrugs,
      note: input.note ?? null,
      html,
    };
  }
}
