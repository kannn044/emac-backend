/**
 * Third-party OAuth broker flow (real mode)
 *   GET /auth/login?redirect_to=... → 302 ไป Provider ID พร้อม wrapped state
 *   GET /auth/callback?code&state   → 302 เด้ง code ไป redirect_to ของ partner
 *   POST /auth/callback {code}      → session JWT
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeTestHarness } from '../helpers/test-app';
import type { AuthProvider, MockProfileSummary } from '@/modules/auth/ports';
import type { ProviderInfo } from '@/modules/auth/types';

/** จำลอง real provider โดยไม่ยิง MOPH จริง */
class FakeRealProvider implements AuthProvider {
  readonly kind = 'real' as const;
  lastState: string | undefined;

  buildAuthorizeUrl(state?: string): string {
    this.lastState = state;
    const url = new URL('https://uat-provider.id.th/v1/oauth2/authorize');
    url.searchParams.set('client_id', 'test-client');
    url.searchParams.set('response_type', 'code');
    if (state) url.searchParams.set('state', state);
    return url.toString();
  }

  listMockProfiles(): MockProfileSummary[] {
    return [];
  }

  async authenticate(credential: string): Promise<ProviderInfo> {
    if (credential !== 'good-code') {
      const { AppError } = await import('@/core/errors');
      throw AppError.unauthorized('bad code');
    }
    return {
      providerId: 'real-doc-001',
      name: 'นพ. ทดสอบ จริง',
      position: 'แพทย์',
      license: 'MD-1',
      hospcode: '10670',
      hospitalName: 'รพ.ทดสอบ',
      role: 'doctor',
      isMedicalPersonnel: true,
    };
  }
}

const PARTNER_CB = 'https://his-a.hospital.go.th/emac/callback';

function makeBrokerHarness() {
  const fake = new FakeRealProvider();
  const harness = makeTestHarness({
    env: {
      THIRD_PARTY_REDIRECT_ALLOWLIST: 'https://his-a.hospital.go.th',
      MOPH_PROVIDER_FRONTEND_CALLBACK_URL: 'https://emac.moph.go.th/',
    },
    overrides: { auth: fake },
  });
  return { ...harness, fake };
}

describe('third-party OAuth broker', () => {
  it('login?redirect_to (allowlisted) → 302 พร้อม wrapped state', async () => {
    const { app, fake } = makeBrokerHarness();
    const res = await request(app)
      .get('/auth/login')
      .query({ redirect_to: PARTNER_CB, state: 'partner-xyz' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('uat-provider.id.th');
    // state ถูกห่อ (รูปแบบ payload.sig) ไม่ใช่ค่าดิบของ partner
    expect(fake.lastState).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('login?redirect_to นอก allowlist → 400', async () => {
    const { app } = makeBrokerHarness();
    const res = await request(app)
      .get('/auth/login')
      .query({ redirect_to: 'https://evil.example/cb' });
    expect(res.status).toBe(400);
  });

  it('callback เด้ง code + partner state กลับไป redirect_to', async () => {
    const { app, fake } = makeBrokerHarness();
    await request(app)
      .get('/auth/login')
      .query({ redirect_to: PARTNER_CB, state: 'partner-xyz' });

    const res = await request(app)
      .get('/auth/callback')
      .query({ code: 'good-code', state: fake.lastState ?? '' });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.location ?? '');
    expect(`${loc.origin}${loc.pathname}`).toBe(PARTNER_CB);
    expect(loc.searchParams.get('code')).toBe('good-code');
    expect(loc.searchParams.get('state')).toBe('partner-xyz');
  });

  it('callback ที่ state ไม่ใช่ wrapped → เด้งไป frontend ปกติ (emac)', async () => {
    const { app } = makeBrokerHarness();
    const res = await request(app)
      .get('/auth/callback')
      .query({ code: 'good-code', state: 'plain-uuid-state' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://emac.moph.go.th/');
    expect(res.headers.location).toContain('code=good-code');
  });

  it('POST /auth/callback แลก code เป็น session ใช้ /auth/me ได้', async () => {
    const { app } = makeBrokerHarness();
    const res = await request(app).post('/auth/callback').send({ code: 'good-code' });
    expect(res.status).toBe(201);
    expect(res.body.profile.providerId).toBe('real-doc-001');

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.identity.hospcode).toBe('10670');
  });

  it('POST /auth/callback ด้วย code ผิด → 401', async () => {
    const { app } = makeBrokerHarness();
    const res = await request(app).post('/auth/callback').send({ code: 'bad' });
    expect(res.status).toBe(401);
  });

  it('callback คืน refreshToken → POST /auth/refresh ออก access ใหม่ใช้ /auth/me ได้', async () => {
    const { app } = makeBrokerHarness();
    const login = await request(app).post('/auth/callback').send({ code: 'good-code' });
    expect(login.body.refreshToken).toBeTruthy();
    expect(login.body.refreshExpiresAt).toBeTruthy();

    const refreshed = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refreshed.status).toBe(201);
    expect(refreshed.body.token).toBeTruthy();
    expect(refreshed.body.refreshToken).toBeTruthy();

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.identity.providerId).toBe('real-doc-001');
  });

  it('POST /auth/refresh ด้วย token มั่ว → 401', async () => {
    const { app } = makeBrokerHarness();
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'not.a.token' });
    expect(res.status).toBe(401);
  });

  it('real mode: /auth/mode = real และ mock endpoints ปิด', async () => {
    const { app } = makeBrokerHarness();
    const mode = await request(app).get('/auth/mode');
    expect(mode.body.mode).toBe('real');
    const providers = await request(app).get('/auth/providers');
    expect(providers.status).toBe(404);
    const mockLogin = await request(app)
      .post('/auth/session')
      .send({ providerId: 'x' });
    expect(mockLogin.status).toBe(400);
  });
});
