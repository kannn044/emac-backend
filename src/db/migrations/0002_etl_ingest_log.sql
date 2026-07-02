-- ประวัติการ import ไฟล์ ETL — track ใน DB (กันนำเข้าซ้ำด้วย checksum) — workflow.md §2.2

CREATE TABLE IF NOT EXISTS etl_ingest_log (
    id                  BIGSERIAL PRIMARY KEY,
    file_name           TEXT NOT NULL,
    checksum            TEXT NOT NULL,                   -- sha256 ของเนื้อไฟล์
    status              TEXT NOT NULL,                   -- imported | skipped_duplicate | failed
    rows_read           INT NOT NULL DEFAULT 0,
    patients_affected   INT NOT NULL DEFAULT 0,
    inserted            INT NOT NULL DEFAULT 0,
    updated             INT NOT NULL DEFAULT 0,
    skipped             INT NOT NULL DEFAULT 0,
    error               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ingest_status CHECK (status IN ('imported', 'skipped_duplicate', 'failed'))
);

CREATE INDEX IF NOT EXISTS ix_ingest_checksum ON etl_ingest_log (checksum, status);
