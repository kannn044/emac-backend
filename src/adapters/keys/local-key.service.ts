/**
 * LocalKeyService — key custody + signing แบบ local (dev) ด้วย Ed25519
 *
 * เก็บ private key เป็น PEM ใน SigningKeyStore (dev เท่านั้น)
 * prod: เพิ่ม KmsKeyService (kind:'kms') — private key อยู่ใน HSM/KMS ไม่ออกมา
 * โดย signature contract เดิม (base64) ไม่เปลี่ยน → service/verify ฝั่งอื่นไม่แก้
 */
import {
  generateKeyPairSync,
  randomUUID,
  sign as cryptoSign,
  verify as cryptoVerify,
  createPublicKey,
} from 'node:crypto';
import type { Clock } from '@/ports/index';
import type { KeyService, SigningKeyStore } from '@/modules/auth/ports';
import { AppError } from '@/core/errors';

export class LocalKeyService implements KeyService {
  readonly kind = 'local' as const;

  constructor(
    private readonly store: SigningKeyStore,
    private readonly clock: Clock,
  ) {}

  async ensureEnrolled(providerId: string): Promise<string> {
    const existing = await this.store.findByProviderId(providerId);
    if (existing) return existing.keyId;

    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const keyId = randomUUID();
    await this.store.insert({
      providerId,
      keyId,
      algorithm: 'Ed25519',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      privateKeyPem: privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString(),
      createdAt: this.clock.now(),
    });
    return keyId;
  }

  async sign(keyId: string, data: string | Buffer): Promise<string> {
    const rec = await this.store.findByKeyId(keyId);
    if (!rec) throw AppError.internal('Signing key not found');
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    // Ed25519 → algorithm ต้องเป็น null
    return cryptoSign(null, buf, rec.privateKeyPem).toString('base64');
  }

  async getPublicKeyPem(providerId: string): Promise<string | null> {
    const rec = await this.store.findByProviderId(providerId);
    return rec ? rec.publicKeyPem : null;
  }
}

/** util สำหรับ test/verify endpoint — ตรวจ signature ด้วย public key PEM */
export function verifyEd25519(
  publicKeyPem: string,
  data: string | Buffer,
  signatureBase64: string,
): boolean {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return cryptoVerify(
    null,
    buf,
    createPublicKey(publicKeyPem),
    Buffer.from(signatureBase64, 'base64'),
  );
}
