-- Patient demographics (P5+) — ข้อมูลผู้ป่วยสำหรับแสดงบนบัตร/รายการ
-- จริงมาจาก HIS; เพิ่มคอลัมน์ให้ ETL/seed เติมได้ (nullable — ของเดิมไม่พัง)

ALTER TABLE patient_drugallergy ADD COLUMN IF NOT EXISTS full_name  TEXT;
ALTER TABLE patient_drugallergy ADD COLUMN IF NOT EXISTS sex        TEXT;
ALTER TABLE patient_drugallergy ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE patient_drugallergy ADD COLUMN IF NOT EXISTS address    TEXT;
