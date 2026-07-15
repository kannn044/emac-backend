/**
 * SessionService — ออก/ตรวจ token ของระบบเรา (หลัง login สำเร็จ)
 *
 * โมเดล token:
 *   - access token  : อายุสั้น (default 30 นาที) — แนบทุก request (Bearer)
 *   - refresh token : ต่ออายุ access ได้จนถึงเพดาน session (login + 12 ชม.)
 *     เกิน 12 ชม. → refresh ไม่ได้ ต้อง login ใหม่ (authenticate ใหม่กับ Provider ID)
 *
 * ทั้งคู่เป็น stateless JWT (HS256) — ไม่มี DB session; sessionExp ฝังใน token
 * deterministic: ใช้ Clock port → test กำหนดเวลา/หมดอายุได้
 */
import { randomUUID } from 'node:crypto';
import { signJwt, verifyJwt } from '@/core/jwt';
import { AppError } from '@/core/errors';
import type { Clock } from '@/ports/index';
import type {
  AuthContext,
  ProviderInfo,
  Role,
  SessionClaims,
  TokenType,
} from './types';
import { ALLOWED_ROLES } from './types';

export interface IssuedSession {
  token: string; // access token
  expiresAt: string; // ISO — access token หมดอายุ
  refreshToken: string;
  refreshExpiresAt: string; // ISO — เพดาน session (login + 12 ชม.)
}

/** ข้อมูล identity ที่ผูกกับ session (ใช้สร้าง token ใหม่ตอน refresh) */
interface SessionIdentity {
  providerId: string;
  hospcode: string;
  hospitalName: string;
  role: Role;
  name: string;
  keyId: string;
}

export class SessionService {
  constructor(
    private readonly secret: string,
    private readonly accessTtlSeconds: number,
    private readonly refreshTtlSeconds: number,
    private readonly clock: Clock,
  ) {}

  /** ออก session หลัง login — sessionExp = now + refreshTtl (เพดาน 12 ชม.) */
  issue(info: ProviderInfo, keyId: string): IssuedSession {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const sessionExp = now + this.refreshTtlSeconds;
    const sid = randomUUID();
    return this.buildSession(
      {
        providerId: info.providerId,
        hospcode: info.hospcode,
        hospitalName: info.hospitalName,
        role: info.role,
        name: info.name,
        keyId,
      },
      sid,
      sessionExp,
      now,
    );
  }

  /**
   * ต่ออายุด้วย refresh token → ออก access + refresh ชุดใหม่ (sid/sessionExp เดิม)
   * ถ้า refresh token หมดอายุ (เกินเพดาน 12 ชม.) → 401 (ต้อง login ใหม่)
   */
  refresh(refreshToken: string): IssuedSession {
    const claims = this.decode(refreshToken);
    const now = Math.floor(this.clock.now().getTime() / 1000);

    if (claims.typ !== 'refresh') {
      throw AppError.unauthorized('ต้องใช้ refresh token');
    }
    // refresh token exp = sessionExp (เพดาน) — เกินแล้วต้อง login ใหม่
    if (claims.exp <= now) {
      throw AppError.unauthorized('Session หมดอายุ (เกิน 12 ชม.) กรุณาเข้าสู่ระบบใหม่');
    }

    return this.buildSession(
      {
        providerId: claims.sub,
        hospcode: claims.hospcode,
        hospitalName: claims.hospitalName,
        role: claims.role,
        name: claims.name,
        keyId: claims.keyId,
      },
      claims.sid,
      claims.sessionExp,
      now,
    );
  }

  /** ตรวจ access token → AuthContext (โยน AppError.unauthorized ถ้าไม่ผ่าน/หมดอายุ) */
  verify(token: string): AuthContext {
    const claims = this.decode(token);
    const now = Math.floor(this.clock.now().getTime() / 1000);

    if (claims.typ !== 'access') {
      // กันเอา refresh token มาเรียก API ตรง ๆ
      throw AppError.unauthorized('ต้องใช้ access token');
    }
    if (claims.exp <= now) {
      throw AppError.unauthorized('Session expired');
    }

    return {
      providerId: claims.sub,
      hospcode: claims.hospcode,
      hospitalName: claims.hospitalName,
      role: claims.role,
      name: claims.name,
      keyId: claims.keyId,
    };
  }

  /** สร้าง access + refresh คู่ใหม่ (access exp ไม่เกิน sessionExp) */
  private buildSession(
    id: SessionIdentity,
    sid: string,
    sessionExp: number,
    now: number,
  ): IssuedSession {
    // access หมดอายุ = min(now + accessTtl, sessionExp) — ไม่ให้ access ล้ำเพดาน session
    const accessExp = Math.min(now + this.accessTtlSeconds, sessionExp);

    const token = this.sign(id, sid, sessionExp, 'access', now, accessExp);
    const refreshToken = this.sign(id, sid, sessionExp, 'refresh', now, sessionExp);

    return {
      token,
      expiresAt: new Date(accessExp * 1000).toISOString(),
      refreshToken,
      refreshExpiresAt: new Date(sessionExp * 1000).toISOString(),
    };
  }

  private sign(
    id: SessionIdentity,
    sid: string,
    sessionExp: number,
    typ: TokenType,
    iat: number,
    exp: number,
  ): string {
    const claims: SessionClaims = {
      sub: id.providerId,
      hospcode: id.hospcode,
      hospitalName: id.hospitalName,
      role: id.role,
      name: id.name,
      keyId: id.keyId,
      typ,
      sid,
      sessionExp,
      iat,
      exp,
    };
    return signJwt(claims, this.secret);
  }

  /** verify signature + validate โครง claims (ไม่เช็ค exp/typ ที่นี่ — caller เช็คเอง) */
  private decode(token: string): SessionClaims {
    const p = verifyJwt(token, this.secret);

    const typ = p['typ'];
    const sub = p['sub'];
    const hospcode = p['hospcode'];
    const hospitalName = p['hospitalName'];
    const role = p['role'];
    const name = p['name'];
    const keyId = p['keyId'];
    const sid = p['sid'];
    const sessionExp = p['sessionExp'];
    const exp = p['exp'];
    const iat = p['iat'];

    if (
      (typ !== 'access' && typ !== 'refresh') ||
      typeof sub !== 'string' ||
      typeof hospcode !== 'string' ||
      typeof name !== 'string' ||
      typeof keyId !== 'string' ||
      typeof sid !== 'string' ||
      typeof sessionExp !== 'number' ||
      typeof exp !== 'number' ||
      typeof iat !== 'number' ||
      typeof role !== 'string' ||
      !ALLOWED_ROLES.includes(role as Role)
    ) {
      throw AppError.unauthorized('Invalid session claims');
    }

    return {
      sub,
      hospcode,
      hospitalName: typeof hospitalName === 'string' ? hospitalName : '',
      role: role as Role,
      name,
      keyId,
      typ,
      sid,
      sessionExp,
      iat,
      exp,
    };
  }
}
