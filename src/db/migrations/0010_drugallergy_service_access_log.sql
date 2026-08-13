-- Access log สำหรับ service endpoint (M2M / third-party หลังบ้าน): /api/v1/drugallergy/lookup
-- บันทึก "ใครค้น CID อะไร ได้กี่ record" ทุกผลลัพธ์ (สำเร็จ + ถูกปฏิเสธ)
-- NOTE: cid เก็บดิบ (เลขบัตรประชาชน = PII) → ตารางนี้เป็นข้อมูลอ่อนไหว
--       ต้องคุมสิทธิ์เข้าถึง + ตั้ง retention (เช่น purge > 2 ปี) ตาม PDPA

CREATE TABLE IF NOT EXISTS drugallergy_service_access_log (
    id             BIGSERIAL PRIMARY KEY,
    ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_ip      TEXT,                       -- IP ผู้เรียก (จาก CF-Connecting-IP)
    api_key_id     TEXT,                       -- fingerprint สั้นของ API key ที่ใช้ (ไม่เก็บ key จริง)
    cid            TEXT,                        -- CID ที่ค้น (ดิบ)
    result_count   INT  NOT NULL DEFAULT 0,     -- จำนวน record ที่คืนกลับ
    status         INT  NOT NULL,               -- HTTP status: 200/400/401/403/503
    request_id     TEXT                         -- ผูกกับ access log ของ nginx/pino
);

CREATE INDEX IF NOT EXISTS ix_dsal_ts ON drugallergy_service_access_log (ts);
CREATE INDEX IF NOT EXISTS ix_dsal_cid ON drugallergy_service_access_log (cid, ts);
