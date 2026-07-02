-- Audit log (P3+) — บันทึกทุก action ที่ดู/เปลี่ยน state ของ record ผู้ป่วย
-- P3: VIEW (เปิด detail); P4: STAMP/REJECT/EDIT (verify flow)

CREATE TABLE IF NOT EXISTS verification_audit_log (
    id           BIGSERIAL PRIMARY KEY,
    action       TEXT NOT NULL,                 -- VIEW | STAMP | REJECT | EDIT
    provider_id  TEXT NOT NULL,                 -- ใครทำ (จาก session)
    hospcode     CHAR(5) NOT NULL,              -- tenant
    patient_id   BIGINT NOT NULL,               -- อ้าง patient_drugallergy.id
    request_id   TEXT,                          -- trace ข้าม log
    detail       JSONB,                         -- payload เพิ่มเติม (เช่น diff, reason)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_audit_action CHECK (action IN ('VIEW', 'STAMP', 'REJECT', 'EDIT'))
);

CREATE INDEX IF NOT EXISTS ix_audit_patient ON verification_audit_log (patient_id);
CREATE INDEX IF NOT EXISTS ix_audit_hospcode_action ON verification_audit_log (hospcode, action);
