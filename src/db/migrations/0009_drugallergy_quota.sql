-- โควตาการดึงข้อมูลแพ้ยา (drug allergy history query) แบบรายวันต่อ client
-- นับจำนวน record ที่ดึงได้ต่อวัน (reset เที่ยงคืนเวลาไทย — quota_date เก็บเป็นวันที่ ICT)
-- client_key = hospcode ของ session ผู้เรียก (third-party HIS 1 ราย = 1 รพ.)

CREATE TABLE IF NOT EXISTS drugallergy_quota (
    client_key      TEXT NOT NULL,                   -- hospcode ของผู้เรียก
    quota_date      DATE NOT NULL,                   -- วัน (เขต ICT) ที่นับโควตา
    used_records    INT  NOT NULL DEFAULT 0,         -- จำนวน record ที่ดึงไปแล้ววันนี้
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (client_key, quota_date),
    CONSTRAINT chk_daq_used_nonneg CHECK (used_records >= 0)
);
