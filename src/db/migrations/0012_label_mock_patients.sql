-- Replace only the 12 known legacy demo fixtures, never all patients.
-- Preserve row IDs, clinical data, workflow status, notes and signed snapshots.
-- Run BEFORE seed:patients. Applied once by the migration runner.

UPDATE patient_drugallergy
SET natural_key = '88c33dab694bd8af8ecba39d54bc6a8a7e1bd7dce3f3539a73fb1ab0de24cabb', pid = 'MOCK-PID-001',
    cid = NULL, hn = 'MOCK-HN-001',
    full_name = 'ผู้ป่วยทดสอบ 001', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = '6dd4de77cc95069bea45316408f2574b660dbaa40be1ff45d6306b5b57ae6e00'
  AND hospcode = '10670' AND pid = '00012345'
  AND cid = '9999900000001' AND hn = 'HN-2026-0001'
  AND full_name = 'นายสมหมาย ใจดี';

UPDATE patient_drugallergy
SET natural_key = '8f4e5195792c0df43f66b8434f56faba6972a6f6c2318992a0a7037fd79650b7', pid = 'MOCK-PID-002',
    cid = NULL, hn = 'MOCK-HN-002',
    full_name = 'ผู้ป่วยทดสอบ 002', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = 'ef4f154fb82bfdb0dcc5997f4af03037319376e68de2d8b35a72bb193ce61637'
  AND hospcode = '10670' AND pid = '00023456'
  AND cid = '9999900000002' AND hn = 'HN-2026-0002'
  AND full_name = 'นางสาวบุปผา แก้วมณี';

UPDATE patient_drugallergy
SET natural_key = '6a9de6b36c2092a146ac90bbbf699aa41b8bf325641a85aaba877a3d79ed74f6', pid = 'MOCK-PID-003',
    cid = NULL, hn = 'MOCK-HN-003',
    full_name = 'ผู้ป่วยทดสอบ 003', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = 'c8bd4e706424f33937abbba18bac2516ca1a6c11d056abc32aa12fa9fbb67395'
  AND hospcode = '10670' AND pid = '00034567'
  AND cid = '9999900000003' AND hn = 'HN-2026-0003'
  AND full_name = 'เด็กชายธนา สุขใจ';

UPDATE patient_drugallergy
SET natural_key = '31d6d60825e42d5b885de94d2bade1b9e792b45ebc5a2f10fcedc5c656aaa274', pid = 'MOCK-PID-004',
    cid = NULL, hn = 'MOCK-HN-004',
    full_name = 'ผู้ป่วยทดสอบ 004', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = '4911499b2d41f3bc1b1e45e2a9bdf175f001e1f582a5282638f32ad833e9296e'
  AND hospcode = '10670' AND pid = '00045678'
  AND cid = '9999900000004' AND hn = 'HN-2026-0004'
  AND full_name = 'นางวิไล ทองคำ';

UPDATE patient_drugallergy
SET natural_key = '0e6648a6351b933e34c7d1f968f22fb36844e48bd15a8f36268362654074dfc6', pid = 'MOCK-PID-005',
    cid = NULL, hn = 'MOCK-HN-005',
    full_name = 'ผู้ป่วยทดสอบ 005', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = 'ba3655a77a50f60aca3bde115c76ab9018fb906ac01ce97050c87e9a348f3b85'
  AND hospcode = '10670' AND pid = '00056789'
  AND cid = '9999900000005' AND hn = 'HN-2026-0005'
  AND full_name = 'นายชูเกียรติ พงษ์ไพร';

UPDATE patient_drugallergy
SET natural_key = '2701cdcb5c6ec90d38597822b6877d697569711d79cf86c92295a94a09d81a13', pid = 'MOCK-PID-006',
    cid = NULL, hn = 'MOCK-HN-006',
    full_name = 'ผู้ป่วยทดสอบ 006', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = 'f07ffa52d762d3e511089f761ba78b1281d284d1621bfc3950593547abf44a8e'
  AND hospcode = '10670' AND pid = '00067890'
  AND cid = '9999900000006' AND hn = 'HN-2026-0006'
  AND full_name = 'นางสาวกัลยา ศรีสมบูรณ์';

UPDATE patient_drugallergy
SET natural_key = '7e6d104798be82e5331baeaf6c3ec2dde1e289d20be8a00eee1bbb1068bd3ff3', pid = 'MOCK-PID-007',
    cid = NULL, hn = 'MOCK-HN-007',
    full_name = 'ผู้ป่วยทดสอบ 007', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = 'bee05807279cec6c8765290d6fc6f72488391f22c252fd0000b5a861571853a4'
  AND hospcode = '10670' AND pid = '00078901'
  AND cid = '9999900000007' AND hn = 'HN-2026-0007'
  AND full_name = 'นายมานพ เงินทอง';

UPDATE patient_drugallergy
SET natural_key = '50affb794ba5f09c459382deef7ba79986cf07ef28af98afdf590194604c9b8c', pid = 'MOCK-PID-008',
    cid = NULL, hn = 'MOCK-HN-008',
    full_name = 'ผู้ป่วยทดสอบ 008', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = 'db18485970feb8f90541436769700faf3f8e85bf4746d6808f4a576622d8468a'
  AND hospcode = '10670' AND pid = '00089012'
  AND cid = '9999900000008' AND hn = 'HN-2026-0008'
  AND full_name = 'นางกนกพร ผ่องใส';

UPDATE patient_drugallergy
SET natural_key = 'f98816c51eee1aded099668b4a4efdbd519d560040d38ebb7f6ca76571dfd420', pid = 'MOCK-PID-009',
    cid = NULL, hn = 'MOCK-HN-009',
    full_name = 'ผู้ป่วยทดสอบ 009', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = '5c5b7c35538fd13037af4feb882f1e47982a81dfaede61e0c168f4f7fe7914d9'
  AND hospcode = '10670' AND pid = '00090123'
  AND cid = '9999900000009' AND hn = 'HN-2026-0009'
  AND full_name = 'นายพิชัย รุ่งเรือง';

UPDATE patient_drugallergy
SET natural_key = '6e7da4c13c2205ee0861db7692fe657332bc8229547cc0edf8497c22eaca26be', pid = 'MOCK-PID-010',
    cid = NULL, hn = 'MOCK-HN-010',
    full_name = 'ผู้ป่วยทดสอบ 010', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = '1c2bea5f72685a9fc8720e8f8bbdf56dc916493156c7bfb53eef0aca9c6774c4'
  AND hospcode = '10670' AND pid = '00101234'
  AND cid = '9999900000010' AND hn = 'HN-2026-0010'
  AND full_name = 'นางสาวนภา ดาวเรือง';

UPDATE patient_drugallergy
SET natural_key = '69e460b6da6b65580cb3afde322450117a99005ef65a12fc48bfcbe58ef4f62d', pid = 'MOCK-PID-011',
    cid = NULL, hn = 'MOCK-HN-011',
    full_name = 'ผู้ป่วยทดสอบ 011', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = '47d09bf5ec8d3b26886244cea2140f6d3c9e08c420aab9afdc3a96622c63e74f'
  AND hospcode = '11292' AND pid = '00111234'
  AND cid = '9999900000011' AND hn = 'CM-2026-0101'
  AND full_name = 'นายบุญมี คำดี';

UPDATE patient_drugallergy
SET natural_key = 'e46498dd228987c544de38af357e4d7675dccdb9188427c55ec23377820e539e', pid = 'MOCK-PID-012',
    cid = NULL, hn = 'MOCK-HN-012',
    full_name = 'ผู้ป่วยทดสอบ 012', birth_date = NULL,
    address = 'ข้อมูลทดสอบ — ไม่มีที่อยู่จริง', updated_at = now()
WHERE natural_key = 'e29a639581d9fe3a0604eff6b31882f0fae0bf7f9719a785a497bae68df63e6e'
  AND hospcode = '11292' AND pid = '00121234'
  AND cid = '9999900000012' AND hn = 'CM-2026-0102'
  AND full_name = 'นางเพ็ญศรี ใจงาม';
