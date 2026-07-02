-- ตารางตั้งต้นจาก ETL pipeline (UPSERT โดย importer) — workflow.md §3
-- NOTE: pilot (เขต 9, ~20-30k ราย) ยังไม่ partition; partition ตาม zone_code
--       เป็น migration เพิ่มภายหลังเมื่อสเกลระดับประเทศ (unique ต้องรวม partition key)

CREATE TABLE IF NOT EXISTS patient_drugallergy (
    id                  BIGSERIAL PRIMARY KEY,
    natural_key         TEXT UNIQUE NOT NULL,            -- idempotent key จาก ETL
    hospcode            CHAR(5) NOT NULL,                -- รพ. ที่ admit (tenant key)
    pid                 TEXT NOT NULL,
    cid                 TEXT,                            -- เติมภายหลัง (ไม่อยู่ใน contract ปัจจุบัน)
    hn                  TEXT,
    diagcode            TEXT NOT NULL,                   -- L511 | L512 | L519
    datetime_admit      DATE NOT NULL,
    suspect_drugs       JSONB NOT NULL,                  -- [{didstd,dname,dateServ,group}]
    nsaid_groups        TEXT[] NOT NULL DEFAULT '{}',
    systemic_nsaids     TEXT[] NOT NULL DEFAULT '{}',
    antibiotic_groups   TEXT[] NOT NULL DEFAULT '{}',
    other_groups        TEXT[] NOT NULL DEFAULT '{}',
    status              TEXT NOT NULL DEFAULT 'pending',
    source_loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pda_status CHECK (status IN ('pending', 'verified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS ix_pda_hospcode_status ON patient_drugallergy (hospcode, status);
CREATE INDEX IF NOT EXISTS ix_pda_cid ON patient_drugallergy (cid);
