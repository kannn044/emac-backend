/**
 * SigningKeyStore adapters — เก็บ keypair ของ provider
 *   - InMemorySigningKeyStore: dev/test (ไม่ต้องมี DB)
 *   - PostgresSigningKeyStore: รันจริง (ตาราง provider_signing_key)
 */
import type { Pool } from 'pg';
import type { SigningKeyRecord, SigningKeyStore } from '@/modules/auth/ports';

export class InMemorySigningKeyStore implements SigningKeyStore {
  private readonly byProvider = new Map<string, SigningKeyRecord>();
  private readonly byKeyId = new Map<string, SigningKeyRecord>();

  async findByProviderId(providerId: string): Promise<SigningKeyRecord | null> {
    return this.byProvider.get(providerId) ?? null;
  }
  async findByKeyId(keyId: string): Promise<SigningKeyRecord | null> {
    return this.byKeyId.get(keyId) ?? null;
  }
  async insert(record: SigningKeyRecord): Promise<void> {
    this.byProvider.set(record.providerId, record);
    this.byKeyId.set(record.keyId, record);
  }
}

interface KeyRow {
  provider_id: string;
  key_id: string;
  algorithm: string;
  public_key_pem: string;
  private_key_pem: string;
  created_at: Date;
}

function toRecord(row: KeyRow): SigningKeyRecord {
  return {
    providerId: row.provider_id,
    keyId: row.key_id,
    algorithm: row.algorithm,
    publicKeyPem: row.public_key_pem,
    privateKeyPem: row.private_key_pem,
    createdAt: row.created_at,
  };
}

export class PostgresSigningKeyStore implements SigningKeyStore {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async findByProviderId(providerId: string): Promise<SigningKeyRecord | null> {
    const res = await this.pool.query<KeyRow>(
      'SELECT * FROM provider_signing_key WHERE provider_id = $1 LIMIT 1',
      [providerId],
    );
    return res.rows[0] ? toRecord(res.rows[0]) : null;
  }

  async findByKeyId(keyId: string): Promise<SigningKeyRecord | null> {
    const res = await this.pool.query<KeyRow>(
      'SELECT * FROM provider_signing_key WHERE key_id = $1 LIMIT 1',
      [keyId],
    );
    return res.rows[0] ? toRecord(res.rows[0]) : null;
  }

  async insert(record: SigningKeyRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO provider_signing_key
         (provider_id, key_id, algorithm, public_key_pem, private_key_pem, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider_id) DO NOTHING`,
      [
        record.providerId,
        record.keyId,
        record.algorithm,
        record.publicKeyPem,
        record.privateKeyPem,
        record.createdAt,
      ],
    );
  }
}
