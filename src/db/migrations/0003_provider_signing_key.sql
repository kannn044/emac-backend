-- Key enrollment (P2) — เก็บ keypair ของ provider (custody ฝั่ง server)
-- dev: LocalKeyService เก็บ private key PEM ที่นี่
-- prod: สลับเป็น KmsKeyService → คอลัมน์ private_key_pem จะไม่ถูกใช้ (เก็บ key ref แทน)

CREATE TABLE IF NOT EXISTS provider_signing_key (
    provider_id      TEXT PRIMARY KEY,             -- MOPH provider id (1 คน 1 คู่กุญแจ)
    key_id           TEXT UNIQUE NOT NULL,         -- id ของ key (อ้างตอน sign)
    algorithm        TEXT NOT NULL DEFAULT 'Ed25519',
    public_key_pem   TEXT NOT NULL,                -- เปิดสาธารณะที่ /keys/:providerId
    private_key_pem  TEXT NOT NULL,                -- dev เท่านั้น (prod อยู่ใน KMS)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_signing_key_key_id ON provider_signing_key (key_id);
