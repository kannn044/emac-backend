-- Verification (P4) — บันทึกการยืนยันของเภสัช/แพทย์ + ลายเซ็นดิจิทัล (workflow.md §6)
-- ฟิลด์คลินิก (biomarker/severity/manifestations/cross-reactive/alternatives) เภสัชกรกรอกตอน verify

-- note ก่อน stamp (แก้ได้เฉพาะ pending) — เก็บที่ record หลัก
ALTER TABLE patient_drugallergy ADD COLUMN IF NOT EXISTS note TEXT;

CREATE TABLE IF NOT EXISTS allergy_verification (
    id                    BIGSERIAL PRIMARY KEY,
    patient_id            BIGINT NOT NULL UNIQUE           -- 1 record = 1 verification
                          REFERENCES patient_drugallergy(id),
    provider_id           TEXT NOT NULL,
    hospcode              CHAR(5) NOT NULL,
    decision              TEXT NOT NULL DEFAULT 'verified',
    confirmed_drugs       JSONB NOT NULL,                  -- subset ของ suspect_drugs
    biomarker             TEXT,                            -- เช่น HLA-B*15:02
    severity              TEXT NOT NULL,
    manifestations        TEXT[] NOT NULL DEFAULT '{}',
    cross_reactive_drugs  TEXT[] NOT NULL DEFAULT '{}',
    alternative_drugs     TEXT[] NOT NULL DEFAULT '{}',
    note                  TEXT,
    canonical_payload     TEXT NOT NULL,                   -- string ที่ถูกเซ็น (ตรวจซ้ำได้)
    signature             TEXT NOT NULL,                   -- base64
    signature_alg         TEXT NOT NULL DEFAULT 'Ed25519',
    key_id                TEXT NOT NULL,                   -- provider_signing_key.key_id
    signed_at             TIMESTAMPTZ NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ver_decision CHECK (decision IN ('verified'))
);

CREATE INDEX IF NOT EXISTS ix_ver_hospcode ON allergy_verification (hospcode);
