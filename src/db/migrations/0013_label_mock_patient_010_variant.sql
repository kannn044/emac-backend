-- A deployed variant of demo patient 010 uses a different display name.
-- 0012 deliberately required the original name, so this variant was skipped.
-- Keep row ID, clinical/workflow data and signed historical snapshots intact.
UPDATE patient_drugallergy
SET natural_key = '6e7da4c13c2205ee0861db7692fe657332bc8229547cc0edf8497c22eaca26be',
    pid = 'MOCK-PID-010', cid = NULL, hn = 'MOCK-HN-010',
    full_name = 'ผู้ป่วยทดสอบ 010', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = '1c2bea5f72685a9fc8720e8f8bbdf56dc916493156c7bfb53eef0aca9c6774c4'
  AND hospcode = '10670' AND pid = '00101234' AND hn = 'HN-2026-0010'
  AND full_name IN ('นางสาวธัญชนก เรืองศรี', 'นางสาว ธัญชนก เรืองศรี', 'ธัญชนก เรืองศรี');
