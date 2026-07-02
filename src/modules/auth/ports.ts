/**
 * Auth module ports (สัญญา) — service เรียกผ่าน interface เหล่านี้เท่านั้น
 * สลับ mock ↔ real (MOPH OIDC / KMS) โดยไม่แตะ business logic
 */
import type { ProviderInfo } from './types';

/** โปรไฟล์ mock ที่ให้ frontend เลือกตอน dev login (mock adapter เท่านั้น) */
export interface MockProfileSummary {
  providerId: string;
  name: string;
  role: string;
  hospcode: string;
  hospitalName: string;
  isMedicalPersonnel: boolean;
}

/**
 * AuthProvider — MOPH Provider ID (OIDC + api/info)
 * P2 (mock): แปลง mock code/providerId → ProviderInfo
 * real: buildAuthorizeUrl → exchange code → verify id_token (JWKS) → GET api/info
 */
export interface AuthProvider {
  readonly kind: 'mock' | 'real';
  /** ยืนยันตัวตน: mock รับ providerId ตรง ๆ; real รับ authorization code */
  authenticate(credential: string): Promise<ProviderInfo>;
  /** mock เท่านั้น: รายชื่อโปรไฟล์ให้ frontend เลือก (real → []) */
  listMockProfiles(): MockProfileSummary[];
}

/** 1 คู่กุญแจของ provider (custody ฝั่ง server) */
export interface SigningKeyRecord {
  providerId: string;
  keyId: string;
  algorithm: string; // 'Ed25519'
  publicKeyPem: string;
  privateKeyPem: string; // dev: local; prod: อยู่ใน KMS ไม่ออกมา
  createdAt: Date;
}

/** ที่เก็บ public/private key (dev=Postgres/in-memory; prod=KMS metadata) */
export interface SigningKeyStore {
  findByProviderId(providerId: string): Promise<SigningKeyRecord | null>;
  findByKeyId(keyId: string): Promise<SigningKeyRecord | null>;
  insert(record: SigningKeyRecord): Promise<void>;
}

/**
 * KeyService — enroll + sign + public key (P2 enroll, P4 sign)
 * local (Ed25519, dev) ↔ kms (prod) สลับที่ composition root
 */
export interface KeyService {
  readonly kind: 'local' | 'kms';
  /** enroll ครั้งแรกครั้งเดียว → คืน keyId (idempotent ต่อ providerId) */
  ensureEnrolled(providerId: string): Promise<string>;
  /** เซ็น payload ด้วย private key ของ keyId → base64 signature */
  sign(keyId: string, data: string | Buffer): Promise<string>;
  /** public key (PEM) สำหรับ verify (เปิดสาธารณะที่ /keys/:providerId) */
  getPublicKeyPem(providerId: string): Promise<string | null>;
}
