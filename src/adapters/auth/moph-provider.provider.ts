/**
 * MophProviderAuthProvider — MOPH Provider ID (OAuth2 Authorization Code) ตัวจริง
 *
 * อ้างอิง "คู่มือการเชื่อมต่อระบบด้วย OAuth ของ Provider ID" (26 พ.ค. 2568):
 *   1) authorize : GET  {base}/v1/oauth2/authorize?client_id&response_type=code&redirect_uri&scope&state
 *   2) token     : POST {base}/v1/oauth2/token
 *                  Header: Authorization: Basic Base64(client_id:client_secret)
 *                  Body (form-urlencoded): grant_type=authorization_code, code, redirect_uri
 *   3) profile   : GET  {base}/api/v1/services/profile?position_type=1
 *                  Header: Authorization: Bearer <access_token>, client-id, secret-key
 *
 * ไม่ใช่ OIDC (ไม่มี id_token/JWKS) — ความถูกต้องของ access_token ยืนยันโดยการเรียก
 * profile API สำเร็จ (server-to-server ด้วย client credentials ของเรา)
 *
 * แปลง profile → ProviderInfo:
 *   - เลือก organization รายการแรกที่ position เข้าเกณฑ์ แพทย์/เภสัชกร
 *   - hospcode = organization.code9 (5 หลัก) — fallback hcode ถ้าเป็น 5 หลัก
 *   - isMedicalPersonnel = พบ organization ที่เข้าเกณฑ์
 */
import { AppError } from '@/core/errors';
import type { Logger } from '@/core/logger';
import type { AuthProvider, MockProfileSummary } from '@/modules/auth/ports';
import type { ProviderInfo, Role } from '@/modules/auth/types';

export interface MophProviderConfig {
  baseUrl: string; // เช่น https://uat-provider.id.th
  clientId: string;
  clientSecret: string;
  redirectUri: string; // ต้องตรงเป๊ะกับที่ลงทะเบียน (exact match)
  scope: string; // เช่น "cid name_th name_eng organization"
}

/** โครงสร้าง response ของ POST /v1/oauth2/token (เท่าที่ระบบใช้) */
interface TokenResponse {
  status?: string;
  code?: number;
  message?: string;
  message_th?: string;
  data?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
}

/** โครงสร้าง organization ใน profile (เท่าที่ระบบใช้) */
interface ProfileOrganization {
  position?: string | null;
  position_type?: string | null;
  affiliation?: string | null;
  license_id?: string | null;
  license_expired_date?: string | null;
  hcode?: string | null;
  code9?: string | null;
  hname_th?: string | null;
  hname_eng?: string | null;
}

/** โครงสร้าง response ของ GET /api/v1/services/profile (เท่าที่ระบบใช้) */
interface ProfileResponse {
  status?: number;
  message?: string;
  data?: {
    provider_id?: string | null;
    account_id?: string | null;
    title_th?: string | null;
    special_title_th?: string | null;
    name_th?: string | null;
    name_eng?: string | null;
    organization?: ProfileOrganization[] | null;
  };
}

/** คำในตำแหน่ง/วิชาชีพที่ "ไม่ใช่" แพทย์แผนปัจจุบัน แม้จะมีคำว่า "แพทย์" */
const DOCTOR_EXCLUDE = ['ทันตแพทย์', 'สัตวแพทย์', 'แพทย์แผนไทย', 'แพทย์แผนจีน'];

/** map ตำแหน่ง/วิชาชีพจาก Provider ID → role ภายใน (null = ไม่เข้าเกณฑ์) */
export function mapPositionToRole(position: string | null | undefined): Role | null {
  const p = (position ?? '').trim();
  if (!p) return null;
  if (p.includes('เภสัช')) return 'pharmacist';
  if (p.toLowerCase().includes('pharmacist')) return 'pharmacist';
  if (DOCTOR_EXCLUDE.some((x) => p.includes(x))) return null;
  if (p.includes('แพทย์')) return 'doctor';
  if (p.toLowerCase().includes('doctor') || p.toLowerCase().includes('physician')) {
    return 'doctor';
  }
  return null;
}

/** ดึง hospcode 5 หลักจาก organization (code9 เป็นหลัก, fallback hcode) */
export function extractHospcode(org: ProfileOrganization): string {
  const code9 = (org.code9 ?? '').trim();
  if (/^\d{5}$/.test(code9)) return code9;
  const hcode = (org.hcode ?? '').trim();
  if (/^\d{5}$/.test(hcode)) return hcode;
  return '';
}

/** แปลง profile response → ProviderInfo (แยกเป็น pure function เพื่อ unit test) */
export function mapProfileToProviderInfo(profile: ProfileResponse): ProviderInfo {
  const d = profile.data;
  if (!d) {
    throw AppError.unauthorized('Provider ID: profile ไม่มีข้อมูล');
  }

  const providerId = (d.provider_id ?? '').trim() || (d.account_id ?? '').trim();
  if (!providerId) {
    throw AppError.forbidden('ไม่พบข้อมูล Provider ID ของผู้ใช้งาน');
  }

  const orgs = Array.isArray(d.organization) ? d.organization : [];
  // เลือก organization แรกที่ role เข้าเกณฑ์ แพทย์/เภสัชกร
  let selected: ProfileOrganization | undefined;
  let role: Role | null = null;
  for (const org of orgs) {
    const r =
      mapPositionToRole(org.position_type) ??
      mapPositionToRole(org.position) ??
      mapPositionToRole(org.affiliation);
    if (r) {
      selected = org;
      role = r;
      break;
    }
  }

  const name = (d.name_th ?? '').trim() || (d.name_eng ?? '').trim();

  if (!selected || !role) {
    // ไม่เข้าเกณฑ์บุคลากร → คืน info ที่ isMedicalPersonnel=false ให้ AuthService ปฏิเสธ
    return {
      providerId,
      name,
      position: orgs[0]?.position ?? '',
      license: orgs[0]?.license_id ?? '',
      hospcode: orgs[0] ? extractHospcode(orgs[0]) : '',
      hospitalName: orgs[0]?.hname_th ?? '',
      role: 'doctor', // placeholder — ไม่ถูกใช้เพราะถูกปฏิเสธก่อน
      isMedicalPersonnel: false,
    };
  }

  return {
    providerId,
    name,
    position: selected.position_type ?? selected.position ?? '',
    license: selected.license_id ?? '',
    hospcode: extractHospcode(selected),
    hospitalName: selected.hname_th ?? selected.hname_eng ?? '',
    role,
    isMedicalPersonnel: true,
  };
}

export class MophProviderAuthProvider implements AuthProvider {
  readonly kind = 'real' as const;

  constructor(
    private readonly cfg: MophProviderConfig,
    private readonly logger?: Logger,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** URL หน้า login ของ Provider ID (frontend redirect ผู้ใช้ไปที่นี่) */
  buildAuthorizeUrl(state?: string): string {
    const url = new URL('/v1/oauth2/authorize', this.cfg.baseUrl);
    url.searchParams.set('client_id', this.cfg.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.cfg.redirectUri);
    url.searchParams.set('scope', this.cfg.scope);
    if (state) url.searchParams.set('state', state);
    return url.toString();
  }

  listMockProfiles(): MockProfileSummary[] {
    return []; // real ไม่เปิดเผยรายชื่อ
  }

  /** credential = authorization code จาก redirect ของ Provider ID */
  async authenticate(credential: string): Promise<ProviderInfo> {
    const accessToken = await this.exchangeCode(credential);
    const profile = await this.fetchProfile(accessToken);
    return mapProfileToProviderInfo(profile);
  }

  /** POST /v1/oauth2/token — แลก authorization code เป็น access token */
  private async exchangeCode(code: string): Promise<string> {
    const basic = Buffer.from(
      `${this.cfg.clientId}:${this.cfg.clientSecret}`,
    ).toString('base64');

    const res = await this.request(
      new URL('/v1/oauth2/token', this.cfg.baseUrl).toString(),
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.cfg.redirectUri,
        }).toString(),
      },
    );

    const body = (await res.json().catch(() => null)) as TokenResponse | null;

    if (!res.ok || !body?.data?.access_token) {
      this.logger?.warn(
        { status: res.status, message: body?.message },
        'Provider ID token exchange failed',
      );
      // 400 = code ผิด/หมดอายุ → unauthorized; 401 = client credentials ผิด → แจ้ง ops
      if (res.status === 401) {
        throw AppError.internal('Provider ID: client credentials ไม่ถูกต้อง (ตรวจ MOPH_PROVIDER_CLIENT_ID/SECRET)');
      }
      throw AppError.unauthorized(
        body?.message_th ?? 'เข้าสู่ระบบไม่สำเร็จ: authorization code ไม่ถูกต้องหรือหมดอายุ',
      );
    }
    return body.data.access_token;
  }

  /** GET /api/v1/services/profile — ข้อมูลส่วนบุคคล + สังกัดการทำงาน */
  private async fetchProfile(accessToken: string): Promise<ProfileResponse> {
    const url = new URL('/api/v1/services/profile', this.cfg.baseUrl);
    url.searchParams.set('position_type', '1'); // ขอ key position_type มาช่วย map role

    const res = await this.request(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'client-id': this.cfg.clientId,
        'secret-key': this.cfg.clientSecret,
      },
    });

    const body = (await res.json().catch(() => null)) as ProfileResponse | null;

    if (!res.ok || !body?.data) {
      this.logger?.warn(
        { status: res.status, message: body?.message },
        'Provider ID profile request failed',
      );
      if (res.status === 404) {
        throw AppError.forbidden('ไม่พบข้อมูล Provider ID ของผู้ใช้งาน');
      }
      throw AppError.unauthorized('ไม่สามารถดึงข้อมูลบุคลากรจาก Provider ID ได้');
    }
    return body;
  }

  /** fetch + แปลง network error เป็น AppError (ไม่ leak stack ไปหา client) */
  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, init);
    } catch (err) {
      this.logger?.error({ err, url }, 'Provider ID request network error');
      throw AppError.internal('ไม่สามารถเชื่อมต่อระบบ Provider ID ได้ กรุณาลองใหม่');
    }
  }
}
