-- ขยาย access log ให้ครอบ endpoint /drugallergy/search (session/Provider ID) ด้วย
-- ใช้ตารางเดียวกับ /lookup — เพิ่ม channel + ผู้เรียกฝั่ง session (provider_id, hospcode)

ALTER TABLE drugallergy_service_access_log
  ADD COLUMN IF NOT EXISTS channel     TEXT NOT NULL DEFAULT 'lookup',  -- 'search' | 'lookup'
  ADD COLUMN IF NOT EXISTS provider_id TEXT,                            -- search: providerId ของเภสัช
  ADD COLUMN IF NOT EXISTS hospcode    TEXT;                            -- search: รพ.

CREATE INDEX IF NOT EXISTS ix_dsal_channel ON drugallergy_service_access_log (channel, ts);
CREATE INDEX IF NOT EXISTS ix_dsal_provider ON drugallergy_service_access_log (provider_id, ts);
