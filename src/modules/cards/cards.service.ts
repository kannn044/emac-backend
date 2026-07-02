/**
 * CardService (workflow.md §7) — ออกบัตร (immutable) + ตรวจความแท้ + render
 * บัตรอ้างลายเซ็นของ decision (P4) → verify ด้วย public key ของ provider (ไม่ต้องเชื่อ server)
 */
import type { AppConfig } from '@/config/index';
import type { Clock, IdGenerator } from '@/ports/index';
import type { KeyService } from '@/modules/auth/ports';
import { verifyEd25519 } from '@/adapters/keys/local-key.service';
import { publicUrl } from '@/http/urls';
import type { PatientDetail } from '@/modules/patients/types';
import type { VerificationRecord } from '@/modules/verification/types';
import { ASSESSMENT_LABELS } from '@/modules/verification/types';
import type { AssessmentCode } from '@/modules/verification/types';
import type { CardRepository } from './ports';
import {
  CARD_PRACTICES,
  CARD_WARNING,
  CARD_HEADER_NOTE,
  CARD_TITLE,
  CARD_ASSESSMENT_LEGEND,
  HOSPITAL_NAMES,
} from './card-text';
import type {
  AllergyCard,
  CardLinks,
  CardPayload,
  CardVerifyResult,
} from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class CardService {
  constructor(
    private readonly repo: CardRepository,
    private readonly keys: KeyService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async issueForVerification(args: {
    patient: PatientDetail;
    verification: VerificationRecord;
    providerName: string;
    hospitalName: string;
  }): Promise<AllergyCard> {
    const { patient, verification, providerName, hospitalName } = args;
    const payload: CardPayload = {
      hn: patient.hn,
      pid: patient.pid,
      cid: patient.cid,
      fullName: patient.fullName,
      sex: patient.sex,
      birthDate: patient.birthDate,
      address: patient.address,
      diagcode: patient.diagcode,
      hospcode: verification.hospcode,
      hospitalName:
        hospitalName || HOSPITAL_NAMES[verification.hospcode] || verification.hospcode,
      providerId: verification.providerId,
      providerName,
      confirmedDrugs: verification.confirmedDrugs,
      biomarker: verification.biomarker,
      severity: verification.severity,
      manifestations: verification.manifestations,
      crossReactiveDrugs: verification.crossReactiveDrugs,
      alternativeDrugs: verification.alternativeDrugs,
      note: verification.note,
      signedAt: verification.signedAt,
    };

    const card: AllergyCard = {
      id: this.ids.uuid(),
      patientId: verification.patientId,
      verificationId: verification.id,
      providerId: verification.providerId,
      hospcode: verification.hospcode,
      renderToken: this.ids.uuid(),
      payload,
      // อ้าง decision signature ของ P4 (เนื้อหาคลินิกทั้งหมดอยู่ใน canonical นี้)
      canonicalPayload: verification.canonicalPayload,
      signature: verification.signature,
      signatureAlg: verification.signatureAlg,
      keyId: verification.keyId,
      issuedAt: this.clock.now().toISOString(),
    };
    return this.repo.save(card);
  }

  links(card: AllergyCard): CardLinks {
    return {
      id: card.id,
      renderToken: card.renderToken,
      issuedAt: card.issuedAt,
      verifyUrl: publicUrl(this.config, `/api/v1/cards/${card.id}/verify`),
      embedUrl: publicUrl(this.config, `/embed/card/${card.renderToken}`),
    };
  }

  async getByPatient(
    hospcode: string,
    patientId: string,
  ): Promise<AllergyCard | null> {
    return this.repo.findByPatient(hospcode, patientId);
  }

  async getByRenderToken(token: string): Promise<AllergyCard | null> {
    return this.repo.findByRenderToken(token);
  }

  async getById(id: string): Promise<AllergyCard | null> {
    return this.repo.findById(id);
  }

  /** ตรวจความแท้ด้วย public key (public endpoint) — null = ไม่พบบัตร */
  async verifyCard(id: string): Promise<CardVerifyResult | null> {
    const card = await this.repo.findById(id);
    if (!card) return null;
    const pem = await this.keys.getPublicKeyPem(card.providerId);
    const valid = pem
      ? verifyEd25519(pem, card.canonicalPayload, card.signature)
      : false;
    return {
      valid,
      cardId: card.id,
      issuer: { providerId: card.providerId, name: card.payload.providerName },
      hospcode: card.hospcode,
      hn: card.payload.hn,
      confirmedDrugs: card.payload.confirmedDrugs,
      severity: card.payload.severity,
      biomarker: card.payload.biomarker,
      crossReactiveDrugs: card.payload.crossReactiveDrugs,
      issuedAt: card.issuedAt,
      signedAt: card.payload.signedAt,
    };
  }

  /** HTML บัตรเต็ม ฟอร์แมตบัตรแพ้ยา สธ. (หน้าปก + ตารางรายการแพ้ยา) — สำหรับ iframe/พิมพ์ */
  renderHtml(card: AllergyCard): string {
    const p = card.payload;
    const verifyUrl = publicUrl(this.config, `/api/v1/cards/${card.id}/verify`);
    const signedDate = (p.signedAt || card.issuedAt).slice(0, 10);

    const practices = CARD_PRACTICES.map(
      (t, i) => `<li><span class="num">${i + 1}.</span> ${escapeHtml(t)}</li>`,
    ).join('');

    const rows = p.confirmedDrugs
      .map((d) => {
        const code = (d.assessment ?? '1') as AssessmentCode;
        const reaction =
          d.adverseReaction && d.adverseReaction.trim().length > 0
            ? d.adverseReaction
            : p.manifestations.join(', ') || '-';
        return `<tr>
          <td class="tdrug">${escapeHtml(d.dname)}${d.group ? `<div class="grp">${escapeHtml(d.group)}</div>` : ''}</td>
          <td>${escapeHtml(reaction)}</td>
          <td class="tc">${escapeHtml(code)}<div class="al">${escapeHtml(ASSESSMENT_LABELS[code])}</div></td>
          <td class="rp">${escapeHtml(p.hospitalName)}<br/>${escapeHtml(p.providerName)}<br/>${escapeHtml(signedDate)}</td>
        </tr>`;
      })
      .join('');

    // ข้อมูลเสริม (ไม่มีในบัตรราชการเดิม แต่มีคุณค่าทางคลินิก)
    const extras: string[] = [];
    if (p.biomarker) extras.push(`เภสัชพันธุศาสตร์: <b>${escapeHtml(p.biomarker)}</b>`);
    if (p.crossReactiveDrugs.length)
      extras.push(`ยาที่ควรหลีกเลี่ยง (cross-reactive): ${escapeHtml(p.crossReactiveDrugs.join(', '))}`);
    if (p.alternativeDrugs.length)
      extras.push(`ยาทางเลือก: ${escapeHtml(p.alternativeDrugs.join(', '))}`);

    const fmtSex = p.sex === 'male' ? 'ชาย' : p.sex === 'female' ? 'หญิง' : p.sex ? 'อื่นๆ' : '-';

    return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>บัตรแพ้ยา — ${escapeHtml(p.fullName ?? p.hn ?? p.pid)}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Noto Sans Thai',-apple-system,'Segoe UI',Roboto,sans-serif;background:#eef2f4;padding:14px;color:#0f2f4f}
  .wrap{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
  .card{background:#cdeaf0;border:2px dashed #2a6f8a;border-radius:10px;padding:16px 18px}
  .title{text-align:center;color:#1d4ed8;font-size:22px;font-weight:800;letter-spacing:.02em;margin:6px 0 10px}
  .note{color:#1d4ed8;font-size:12.5px;line-height:1.5;text-align:center;margin-bottom:12px}
  .fields div{border-bottom:1px dotted #2a6f8a;padding:5px 2px;font-size:13px;display:flex;gap:8px}
  .fields .k{color:#0f2f4f;font-weight:700;white-space:nowrap}
  .fields .v{flex:1}
  .warn{margin-top:12px;background:#fee2e2;border:1px solid #ef4444;color:#b91c1c;border-radius:8px;padding:9px 12px;font-size:12.5px;font-weight:700;line-height:1.5}
  h3{color:#1d4ed8;font-size:16px;text-align:center;margin:6px 0 10px;font-weight:800}
  ol.pr{list-style:none;padding:0;margin:0;font-size:12.5px;line-height:1.55}
  ol.pr li{margin-bottom:7px;display:flex;gap:6px}
  ol.pr .num{color:#1d4ed8;font-weight:800}
  table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:6px;overflow:hidden}
  th,td{border:1px solid #2a6f8a;padding:7px 8px;vertical-align:top;text-align:left}
  th{background:#bfe3ea;color:#0f2f4f;font-size:11.5px;font-weight:800;text-align:center}
  .tc{text-align:center;font-weight:800;color:#b91c1c;width:70px}
  .tc .al{font-size:9.5px;color:#64748b;font-weight:600}
  .tdrug{font-weight:700}
  .tdrug .grp{font-size:10px;color:#b91c1c;font-weight:600;margin-top:2px}
  .rp{font-size:10.5px;color:#334155;width:150px}
  .legend{margin-top:8px;font-size:11.5px;color:#1d4ed8;font-weight:700}
  .extras{margin-top:10px;font-size:11.5px;color:#0f2f4f;line-height:1.6}
  .verify{margin-top:8px;font-size:10.5px;color:#475569;word-break:break-all}
  .sig{margin-top:6px;font-size:10.5px;color:#166534}
</style></head>
<body><div class="wrap">

  <!-- หน้าปกบัตร -->
  <div class="card">
    <div class="title">${escapeHtml(CARD_TITLE)}</div>
    <div class="note">${escapeHtml(CARD_HEADER_NOTE)}</div>
    <div class="fields">
      <div><span class="k">ชื่อ-สกุล</span><span class="v">${escapeHtml(p.fullName ?? '-')}</span><span class="k">เพศ</span><span>${fmtSex}</span></div>
      <div><span class="k">เลขบัตรประชาชน (ID No.)</span><span class="v">${escapeHtml(p.cid ?? '-')}</span></div>
      <div><span class="k">HN</span><span class="v">${escapeHtml(p.hn ?? '-')}</span><span class="k">วันเกิด</span><span>${escapeHtml(p.birthDate ?? '-')}</span></div>
      <div><span class="k">ที่อยู่</span><span class="v">${escapeHtml(p.address ?? '-')}</span></div>
      <div><span class="k">โรงพยาบาล/สถานพยาบาล</span><span class="v">${escapeHtml(p.hospitalName)}</span></div>
    </div>
    <div class="warn">${escapeHtml(CARD_WARNING)}</div>
  </div>

  <!-- ข้อควรปฏิบัติ -->
  <div class="card">
    <h3>ข้อควรปฏิบัติ</h3>
    <ol class="pr">${practices}</ol>
  </div>

  <!-- ตารางรายการแพ้ยา -->
  <div class="card">
    <table>
      <thead><tr>
        <th>ยาที่สงสัย<br/>(ชื่อการค้า)</th>
        <th>อาการไม่พึงประสงค์</th>
        <th>ผลการ<br/>ประเมิน*</th>
        <th>หน่วยงาน/ชื่อผู้รายงาน<br/>วดป. ที่รายงาน</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="legend">${escapeHtml(CARD_ASSESSMENT_LEGEND)}</div>
    ${extras.length ? `<div class="extras">${extras.join('<br/>')}</div>` : ''}
    <div class="sig">✔ ลงนามดิจิทัล ${escapeHtml(card.signatureAlg)} โดย ${escapeHtml(p.providerName)} · ${escapeHtml(signedDate)}</div>
    <div class="verify">ตรวจความแท้บัตร: ${escapeHtml(verifyUrl)}</div>
  </div>

</div></body></html>`;
  }
}
