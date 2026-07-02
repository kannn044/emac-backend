/**
 * AuthService — orchestrate login flow (business logic ล้วน, testable เป็น unit)
 *
 *   authenticate (provider) → gate (บุคลากรการแพทย์จริง + hospcode allowlist)
 *   → ensureEnrolled (key) → issue session
 *
 * ไม่รู้จัก express/pg/OIDC — เรียกผ่าน port เท่านั้น
 */
import { AppError } from '@/core/errors';
import type { AuthProvider, KeyService } from './ports';
import type { ProviderInfo } from './types';
import { SessionService, type IssuedSession } from './session.service';

export interface LoginResult {
  session: IssuedSession;
  profile: {
    providerId: string;
    name: string;
    role: string;
    hospcode: string;
    hospitalName: string;
    keyId: string;
  };
}

export class AuthService {
  constructor(
    private readonly provider: AuthProvider,
    private readonly keys: KeyService,
    private readonly sessions: SessionService,
    private readonly hospcodeAllowlist: string[],
  ) {}

  /** mock: credential = providerId; real: credential = OIDC authorization code */
  async login(credential: string): Promise<LoginResult> {
    const info = await this.provider.authenticate(credential);
    this.assertEligible(info);

    const keyId = await this.keys.ensureEnrolled(info.providerId);
    const session = this.sessions.issue(info, keyId);

    return {
      session,
      profile: {
        providerId: info.providerId,
        name: info.name,
        role: info.role,
        hospcode: info.hospcode,
        hospitalName: info.hospitalName,
        keyId,
      },
    };
  }

  /** เงื่อนไขออก session (workflow §4.1) */
  private assertEligible(info: ProviderInfo): void {
    if (!info.isMedicalPersonnel) {
      throw AppError.forbidden('ไม่ใช่บุคลากรทางการแพทย์ — ไม่มีสิทธิ์เข้าใช้งาน');
    }
    if (!/^\d{5}$/.test(info.hospcode)) {
      throw AppError.forbidden('hospcode ไม่ถูกต้อง (ต้อง 5 หลัก)');
    }
    // rollout: จำกัด tenant ช่วงนำร่อง (ว่าง = ไม่จำกัด)
    if (
      this.hospcodeAllowlist.length > 0 &&
      !this.hospcodeAllowlist.includes(info.hospcode)
    ) {
      throw AppError.forbidden('โรงพยาบาลนี้ยังไม่เปิดใช้งานในช่วงนำร่อง');
    }
  }
}
