-- Rejected records (P4) — snapshot ของ record ที่เภสัช/แพทย์ ปฏิเสธ (workflow.md §6.2)
-- แยกออกจาก list จริง เพื่อไม่ให้ข้อมูลที่ถูกปฏิเสธปนกับ pending/verified

CREATE TABLE IF NOT EXISTS rejected_records (
    id           BIGSERIAL PRIMARY KEY,
    patient_id   BIGINT NOT NULL REFERENCES patient_drugallergy(id),
    provider_id  TEXT NOT NULL,
    hospcode     CHAR(5) NOT NULL,
    reason       TEXT NOT NULL,
    snapshot     JSONB NOT NULL,                 -- สภาพ record ตอนถูกปฏิเสธ
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rejected_patient ON rejected_records (patient_id);
CREATE INDEX IF NOT EXISTS ix_rejected_hospcode ON rejected_records (hospcode);
