import type { AllergySource } from '@/modules/drugallergy/ports';
import type { AllergyRawRecord, AllergyRecord } from '@/modules/drugallergy/types';

// Synthetic fixtures only. Never reflect a caller's arbitrary CID into fake medical history.
const MOCK_ROWS: ReadonlyArray<Readonly<AllergyRawRecord>> = [
  row('MOCK-CID-001', 'MOCK-PID-001', '2026-01-01', 'MOCK-DRUG-001', '[MOCK] AMOXICILLIN'),
  row('MOCK-CID-001', 'MOCK-PID-001', '2026-02-01', 'MOCK-DRUG-002', '[MOCK] IBUPROFEN'),
  row('MOCK-CID-002', 'MOCK-PID-002', '2026-01-15', 'MOCK-DRUG-003', '[MOCK] ALLOPURINOL'),
];

function row(cid: string, pid: string, date: string, drug: string, name: string): AllergyRawRecord {
  return {
    HOSPCODE: '00000', PID: pid, CID: cid,
    DATERECORD: date, DRUGALLERGY: drug, DNAME: name,
    TYPEDX: '2', ALEVEL: '1', SYMPTOM: '[MOCK] อาการสมมติสำหรับทดสอบการเชื่อมต่อ',
    INFORMANT: '1', INFORMHOSP: '00000', PROVIDER: 'MOCK-PROVIDER-001',
    HOSPCODE9: null, HOSP9_INFORMHOSP: null,
    D_UPDATE: `${date} 00:00:00`, HDC_DATE: '2026-03-01 00:00:00',
  };
}

export class MockAllergySource implements AllergySource {
  async queryOneFullRaw(cid: string, limit: number): Promise<AllergyRawRecord[]> {
    if (!cid || limit <= 0) return [];
    return MOCK_ROWS.filter(r => r.CID === cid).slice(0, limit).map(r => ({ ...r }));
  }

  async queryOneRaw(cid: string, limit: number): Promise<AllergyRawRecord[]> {
    return (await this.queryOneFullRaw(cid, limit)).map(r => {
      delete r.HOSPCODE;
      delete r.PID;
      delete r.CID;
      return r;
    });
  }

  async queryByCids(cids: string[], limit: number): Promise<AllergyRecord[]> {
    if (limit <= 0) return [];
    return MOCK_ROWS.filter(r => cids.includes(r.CID!))
      .slice().sort((a, b) => a.CID!.localeCompare(b.CID!) || a.DATERECORD!.localeCompare(b.DATERECORD!))
      .slice(0, limit).map(r => ({
        hospcode: r.HOSPCODE!, pid: r.PID!, cid: r.CID!,
        dateRecord: r.DATERECORD!, drugAllergy: r.DRUGALLERGY!, dname: r.DNAME!,
        typeDx: r.TYPEDX!, aLevel: r.ALEVEL!, symptom: r.SYMPTOM!,
        informant: r.INFORMANT!, informHosp: r.INFORMHOSP!, provider: r.PROVIDER!,
        hospcode9: r.HOSPCODE9 ?? null, hosp9InformHosp: r.HOSP9_INFORMHOSP ?? null,
        dateUpdate: r.D_UPDATE!,
      }));
  }
}
