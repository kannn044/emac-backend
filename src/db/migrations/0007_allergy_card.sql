-- E-Allergy Card (P5) — บัตรที่ออกหลัง verify (immutable) — workflow.md §7
-- id/render_token เป็น UUID (opaque) ; card อ้างลายเซ็นของ decision (allergy_verification)

CREATE TABLE IF NOT EXISTS allergy_card (
    id                 TEXT PRIMARY KEY,                 -- uuid
    patient_id         BIGINT NOT NULL REFERENCES patient_drugallergy(id),
    verification_id    BIGINT NOT NULL REFERENCES allergy_verification(id),
    provider_id        TEXT NOT NULL,
    hospcode           CHAR(5) NOT NULL,
    render_token       TEXT UNIQUE NOT NULL,             -- สำหรับ embed (iframe)
    payload            JSONB NOT NULL,                   -- ข้อมูลแสดงบนบัตร
    canonical_payload  TEXT NOT NULL,                    -- string ที่ถูกเซ็น (ตรวจซ้ำได้)
    signature          TEXT NOT NULL,                    -- base64 (decision signature)
    signature_alg      TEXT NOT NULL DEFAULT 'Ed25519',
    key_id             TEXT NOT NULL,
    issued_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_card_patient ON allergy_card (patient_id);
CREATE INDEX IF NOT EXISTS ix_card_hospcode ON allergy_card (hospcode);
