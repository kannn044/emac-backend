/**
 * SessionService — ออก/ตรวจ session JWT ของระบบเรา (หลัง login สำเร็จ)
 * deterministic: ใช้ Clock port → test กำหนดเวลา/หมดอายุได้
 */
import { signJwt, verifyJwt } from '@/core/jwt';
import { AppError } from '@/core/errors';
import type { Clock } from '@/ports/index';
import type { AuthContext, ProviderInfo, Role, SessionClaims } from './types';
import { ALLOWED_ROLES } from './types';

export interface IssuedSession {
  token: string;
  expiresAt: string; // ISO
}

export class SessionService {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds: number,
    private readonly clock: Clock,
  ) {}

  /** ออก session หลัง login (ผูก keyId ที่ enroll แล้ว) */
  issue(info: ProviderInfo, keyId: string): IssuedSession {
    const nowSec = Math.floor(this.clock.now().getTime() / 1000);
    const exp = nowSec + this.ttlSeconds;
    const claims: SessionClaims = {
      sub: info.providerId,
      hospcode: info.hospcode,
      hospitalName: info.hospitalName,
      role: info.role,
      name: info.name,
      keyId,
      iat: nowSec,
      exp,
    };
    return {
      token: signJwt(claims, this.secret),
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  /** ตรวจ token → AuthContext (โยน AppError.unauthorized ถ้าไม่ผ่าน/หมดอายุ) */
  verify(token: string): AuthContext {
    const payload = verifyJwt(token, this.secret);
    const nowSec = Math.floor(this.clock.now().getTime() / 1000);

    const exp = payload['exp'];
    if (typeof exp !== 'number' || exp <= nowSec) {
      throw AppError.unauthorized('Session expired');
    }

    const sub = payload['sub'];
    const hospcode = payload['hospcode'];
    const hospitalName = payload['hospitalName'];
    const role = payload['role'];
    const name = payload['name'];
    const keyId = payload['keyId'];

    if (
      typeof sub !== 'string' ||
      typeof hospcode !== 'string' ||
      typeof name !== 'string' ||
      typeof keyId !== 'string' ||
      typeof role !== 'string' ||
      !ALLOWED_ROLES.includes(role as Role)
    ) {
      throw AppError.unauthorized('Invalid session claims');
    }

    return {
      providerId: sub,
      hospcode,
      hospitalName: typeof hospitalName === 'string' ? hospitalName : '',
      role: role as Role,
      name,
      keyId,
    };
  }
}
