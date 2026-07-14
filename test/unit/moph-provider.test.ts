/**
 * MophProviderAuthProvider — unit tests
 * ครอบคลุม: authorize URL, token exchange, profile mapping (role/hospcode/ปฏิเสธ)
 */
import { describe, it, expect, vi } from 'vitest';
import {
  MophProviderAuthProvider,
  mapPositionToRole,
  extractHospcode,
  mapProfileToProviderInfo,
} from '@/adapters/auth/moph-provider.provider';
import { AppError } from '@/core/errors';

const CFG = {
  baseUrl: 'https://uat-provider.id.th',
  clientId: 'client-1',
  clientSecret: 'secret-1',
  redirectUri: 'https://example.com/auth/callback',
  scope: 'cid name_th organization',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PROFILE_BODY = {
  status: 200,
  message: 'OK',
  data: {
    provider_id: '0111111111X21',
    account_id: '5441234567890',
    name_th: 'นพ. ทดสอบ ระบบ',
    name_eng: 'Test Doctor',
    organization: [
      {
        position: 'แพทย์',
        position_type: 'แพทย์',
        license_id: 'MD-12345',
        hcode: '001234500',
        code9: '10670',
        hname_th: 'โรงพยาบาลทดสอบ',
      },
    ],
  },
};

describe('mapPositionToRole', () => {
  it('map แพทย์/เภสัชกร ได้ถูกต้อง', () => {
    expect(mapPositionToRole('แพทย์')).toBe('doctor');
    expect(mapPositionToRole('นายแพทย์ชำนาญการ')).toBe('doctor');
    expect(mapPositionToRole('เภสัชกรปฏิบัติการ')).toBe('pharmacist');
  });

  it('ปฏิเสธวิชาชีพอื่นที่มีคำว่า "แพทย์"', () => {
    expect(mapPositionToRole('ทันตแพทย์')).toBeNull();
    expect(mapPositionToRole('สัตวแพทย์')).toBeNull();
    expect(mapPositionToRole('แพทย์แผนไทย')).toBeNull();
  });

  it('ปฏิเสธตำแหน่งที่ไม่เข้าเกณฑ์/ว่าง', () => {
    expect(mapPositionToRole('เจ้าหน้าที่ธุรการ')).toBeNull();
    expect(mapPositionToRole('')).toBeNull();
    expect(mapPositionToRole(undefined)).toBeNull();
  });
});

describe('extractHospcode', () => {
  it('ใช้ code9 (5 หลัก) เป็นหลัก', () => {
    expect(extractHospcode({ code9: '10670', hcode: '001234500' })).toBe('10670');
  });
  it('fallback เป็น hcode ถ้าเป็น 5 หลัก', () => {
    expect(extractHospcode({ code9: 'AB123', hcode: '11292' })).toBe('11292');
  });
  it('คืนค่าว่างถ้าไม่มีรหัส 5 หลัก', () => {
    expect(extractHospcode({ code9: '001234500', hcode: null })).toBe('');
  });
});

describe('mapProfileToProviderInfo', () => {
  it('map profile ที่เป็นแพทย์ → ProviderInfo ครบ', () => {
    const info = mapProfileToProviderInfo(PROFILE_BODY);
    expect(info).toMatchObject({
      providerId: '0111111111X21',
      name: 'นพ. ทดสอบ ระบบ',
      role: 'doctor',
      hospcode: '10670',
      hospitalName: 'โรงพยาบาลทดสอบ',
      license: 'MD-12345',
      isMedicalPersonnel: true,
    });
  });

  it('เลือก organization แรกที่เข้าเกณฑ์ (ข้ามที่ไม่ใช่)', () => {
    const info = mapProfileToProviderInfo({
      data: {
        ...PROFILE_BODY.data,
        organization: [
          { position: 'เจ้าหน้าที่ธุรการ', code9: '99999', hname_th: 'ธุรการ' },
          {
            position: 'เภสัชกร',
            license_id: 'PH-1',
            code9: '11292',
            hname_th: 'รพ.สอง',
          },
        ],
      },
    });
    expect(info.role).toBe('pharmacist');
    expect(info.hospcode).toBe('11292');
  });

  it('ไม่มี organization ที่เข้าเกณฑ์ → isMedicalPersonnel=false', () => {
    const info = mapProfileToProviderInfo({
      data: {
        ...PROFILE_BODY.data,
        organization: [{ position: 'เจ้าหน้าที่ธุรการ', code9: '10670' }],
      },
    });
    expect(info.isMedicalPersonnel).toBe(false);
  });

  it('ไม่มี provider_id → forbidden', () => {
    expect(() =>
      mapProfileToProviderInfo({ data: { provider_id: '', account_id: '' } }),
    ).toThrow(AppError);
  });
});

describe('MophProviderAuthProvider', () => {
  it('buildAuthorizeUrl ประกอบ query ครบตามคู่มือ', () => {
    const provider = new MophProviderAuthProvider(CFG);
    const url = new URL(provider.buildAuthorizeUrl('st-123'));
    expect(url.origin).toBe('https://uat-provider.id.th');
    expect(url.pathname).toBe('/v1/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(CFG.redirectUri);
    expect(url.searchParams.get('scope')).toBe(CFG.scope);
    expect(url.searchParams.get('state')).toBe('st-123');
  });

  it('authenticate: แลก code → ดึง profile → ProviderInfo', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, PROFILE_BODY),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: 'Success',
        data: { access_token: 'at-1', token_type: 'Bearer', expires_in: 86400 },
      }),
    );

    const provider = new MophProviderAuthProvider(CFG, undefined, fetchMock as typeof fetch);
    const info = await provider.authenticate('code-xyz');

    expect(info.providerId).toBe('0111111111X21');

    // call 1: token — Basic auth + form-urlencoded
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect(String(tokenUrl)).toBe('https://uat-provider.id.th/v1/oauth2/token');
    const headers = tokenInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('client-1:secret-1').toString('base64')}`,
    );
    const body = new URLSearchParams(String(tokenInit?.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-xyz');
    expect(body.get('redirect_uri')).toBe(CFG.redirectUri);

    // call 2: profile — Bearer + client-id/secret-key
    const [profileUrl, profileInit] = fetchMock.mock.calls[1]!;
    expect(String(profileUrl)).toContain('/api/v1/services/profile');
    const pHeaders = profileInit?.headers as Record<string, string>;
    expect(pHeaders.Authorization).toBe('Bearer at-1');
    expect(pHeaders['client-id']).toBe('client-1');
    expect(pHeaders['secret-key']).toBe('secret-1');
  });

  it('code ผิด/หมดอายุ (400) → unauthorized', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        message: 'The authorization code is invalid or has expired.',
        message_th: 'code oauth ไม่ถูกต้อง หรือ หมดอายุ',
      }),
    );
    const provider = new MophProviderAuthProvider(CFG, undefined, fetchMock);
    await expect(provider.authenticate('bad-code')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('client credentials ผิด (401) → internal error (ปัญหา config ฝั่งเรา)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { message: 'Client authentication failed.' }));
    const provider = new MophProviderAuthProvider(CFG, undefined, fetchMock);
    await expect(provider.authenticate('any')).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });
});
