/**
 * MockAuthProvider — จำลอง MOPH Provider ID ช่วงพัฒนา (ยังไม่มี client id จริง)
 *
 * frontend เรียก listMockProfiles() เพื่อโชว์ตัวเลือก login → ส่ง providerId กลับมาที่
 * authenticate() → คืน ProviderInfo เสมือนได้จาก api/info จริง
 *
 * สลับเป็นของจริง: เพิ่ม MophAuthProvider (kind:'real') ที่ทำ OIDC + GET api/info
 * แล้วเปลี่ยน AUTH_PROVIDER=real ที่ composition root — service/middleware ไม่แก้
 */
import { AppError } from '@/core/errors';
import type { AuthProvider, MockProfileSummary } from '@/modules/auth/ports';
import type { ProviderInfo } from '@/modules/auth/types';

/** seed โปรไฟล์บุคลากร (mock) — ครอบคลุม pharmacist/doctor และเคส reject */
const MOCK_PROFILES: ProviderInfo[] = [
  {
    providerId: 'mock-pharm-001',
    name: 'ภญ. เจนจิรา วัฒนกุล',
    position: 'เภสัชกรชำนาญการ',
    license: 'PH-7740',
    hospcode: '10670',
    hospitalName: 'โรงพยาบาลศิริราช',
    role: 'pharmacist',
    isMedicalPersonnel: true,
  },
  {
    providerId: 'mock-doctor-001',
    name: 'นพ. สมชาย เทวกุล',
    position: 'นายแพทย์ชำนาญการพิเศษ',
    license: 'MD-10221',
    hospcode: '10670',
    hospitalName: 'โรงพยาบาลศิริราช',
    role: 'doctor',
    isMedicalPersonnel: true,
  },
  {
    providerId: 'mock-pharm-002',
    name: 'ภก. อนุชา ตันติวงศ์',
    position: 'เภสัชกรปฏิบัติการ',
    license: 'PH-8815',
    hospcode: '11292',
    hospitalName: 'โรงพยาบาลมหาราชนครเชียงใหม่',
    role: 'pharmacist',
    isMedicalPersonnel: true,
  },
  {
    // เคสทดสอบ: ไม่ใช่บุคลากรการแพทย์ → ต้องถูกปฏิเสธตอน login (P2-2)
    providerId: 'mock-nonmedical-001',
    name: 'สมหญิง ธุรการ',
    position: 'เจ้าหน้าที่ธุรการ',
    license: '',
    hospcode: '10670',
    hospitalName: 'โรงพยาบาลศิริราช',
    role: 'pharmacist',
    isMedicalPersonnel: false,
  },
];

export class MockAuthProvider implements AuthProvider {
  readonly kind = 'mock' as const;
  private readonly byId: Map<string, ProviderInfo>;

  constructor(profiles: ProviderInfo[] = MOCK_PROFILES) {
    this.byId = new Map(profiles.map((p) => [p.providerId, p]));
  }

  async authenticate(credential: string): Promise<ProviderInfo> {
    const info = this.byId.get(credential);
    if (!info) {
      throw AppError.unauthorized('Unknown mock provider');
    }
    return info;
  }

  listMockProfiles(): MockProfileSummary[] {
    return [...this.byId.values()].map((p) => ({
      providerId: p.providerId,
      name: p.name,
      role: p.role,
      hospcode: p.hospcode,
      hospitalName: p.hospitalName,
      isMedicalPersonnel: p.isMedicalPersonnel,
    }));
  }
}
