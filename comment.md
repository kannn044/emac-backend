# วิเคราะห์ข้อเสนอแนะจากเภสัชกรหน้างาน + โรดแมปปรับปรุง eMAC

> เอกสารนี้วิเคราะห์ระบบ eMAC ที่มีอยู่ (backend `api-drugallergy` + frontend `emac-digital-portal`) เทียบกับข้อเสนอแนะ 7 ข้อจากเภสัชกรหน้างาน แล้วเสนอแนวทางปรับปรุงแบบจัดลำดับความสำคัญ **เพื่อทบทวนก่อนลงมือแก้โค้ด**
>
> บริบทที่ตกลงกันไว้: **เป้าหมายเชื่อม HIS ด้วย FHIR** · **อาการแพ้ใช้รหัส WHO-ART** · **flow แจ้งขอประเมินรองรับทั้ง ward แจ้ง + เภสัชสร้างเคสเอง** · เอกสารนี้เป็น **วิเคราะห์ + โรดแมปจัดลำดับ** (ยังไม่แตะโค้ด)

---

## 1. สรุปสถานะระบบปัจจุบัน (ให้เห็นภาพก่อนอ่าน gap)

**สิ่งที่ทำได้แล้ว (จุดแข็ง — ควรรักษาไว้)**

- **ยืนยันตัวตน + ลายเซ็นดิจิทัล**: MOPH Provider ID (mock) → session JWT, enroll คู่กุญแจ Ed25519, ลงนาม decision + ออกบัตรที่ **ตรวจความแท้ได้ด้วย public key** (`/cards/:id/verify`)
- **แยกข้อมูลรายโรงพยาบาล (tenant)** บังคับที่ repository ทุก query + **audit log** ทุก action (VIEW/STAMP/REJECT/EDIT)
- **บัตรแพ้ยาฟอร์แมตราชการ** (หน้าปก + ข้อควรปฏิบัติ + ตารางแพ้ยา 4 คอลัมน์ + ผลประเมิน 1/2/3/H) render เป็น HTML/iframe + QR
- **สถาปัตยกรรม ports & adapters**: external system (HIS/KMS/consent/PHR) ต่อผ่าน port → **สลับ mock ↔ ของจริงได้โดยไม่แก้ business logic** (สำคัญมากต่อข้อเสนอ FHIR ด้านล่าง)
- ETL: ดึงผู้ป่วย IPD วินิจฉัย L51x + retro drug + classifier (NSAID/antibiotic/other) → คิว pending

**สิ่งที่ยังขาด (ตรงกับที่เภสัชสะท้อน)**

- ระบบยังเป็น **เว็บแยกเดี่ยว (standalone)** — เภสัชต้องเข้ามาทำใน eMAC ต่างหากจาก HIS
- ข้อมูลอาการแพ้/cross-reactive เป็น **free text** (ไม่ได้ลงรหัสมาตรฐาน)
- ยังไม่มี **จุดเริ่ม flow "ขอประเมิน"** ที่ชัดเจน และไม่มีการ **ใช้ข้อมูล ณ จุดบริการ (point of care)**
- ยังไม่มี **การเชื่อม HIS/CPOE** จริง (มีแต่ port ที่ออกแบบเผื่อไว้)

---

## 2. ตารางสรุป: 7 ข้อเสนอแนะ → สถานะ → ข้อเสนอ → ทำได้เมื่อไร

| # | ข้อเสนอแนะเภสัช | สถานะปัจจุบัน | ข้อเสนอหลัก | ทำใน eMAC ได้เลย / รอ partner | ลำดับ |
|---|----------------|--------------|-------------|------------------------------|-------|
| 1 | ไม่พบเมนูแจ้งขอ/ยืนยันประเมินแพ้ยา | มีคิวจาก ETL + verify แต่ไม่มี "คำขอประเมิน" ชัดเจน | เพิ่ม entity + เมนู **คำขอประเมิน** (ward แจ้ง) + **สร้างเคสเอง** (เภสัช/walk-in) | **eMAC-now** (ต้นทางจาก HIS = รอ partner) | **สูง** |
| 2 | ทำงาน 2 ครั้ง (eMAC + HIS) | eMAC standalone, ไม่มี write-back | **FHIR AllergyIntolerance** sync + **SMART on FHIR launch** (บันทึกครั้งเดียว) | facade ทำ eMAC-now / launch+write-back = **รอ HIS** | สูง |
| 3 | ไม่พบ use case ใช้ข้อมูล ณ point of care | มีบัตร+QR (ฝั่งผู้ป่วย) แต่ไม่มี query ฝั่งผู้ให้บริการ | **API ดึงแพ้ยาตาม CID** + endpoint แจ้งเตือนตอนจ่ายยา | **eMAC-now** (ฝัง HIS = รอ partner) | สูง |
| 4 | ไม่ integrate HIS / flow หน่วยบริการ | ล็อกอินแยก ไม่อยู่ใน workflow | **SMART on FHIR / EHR launch** + deep-link + ธง allergy บน patient banner | **รอ HIS** (scaffold eMAC-now) | กลาง |
| 5 | อาการแพ้ควรเป็นตัวเลือก medical term | free text | **ตัวเลือกรหัส WHO-ART** (searchable) เก็บ code+term | **eMAC-now** (ต้องมี term set) | **สูง** |
| 6 | Cross-reactive ควรช่วยด้วย PHR + AI | free text เภสัชกรอกเอง | **ฐานความรู้ drug class (TMT→ATC) + auto-suggest แบบ rule** ก่อน แล้วต่อ PHR + AI | rule = **eMAC-now** / PHR+AI = **รอ partner** | กลาง |
| 7 | เชื่อม CPOE ระงับการสั่งยาทันเวลา | P7 ออกแบบไว้ ยังไม่ทำ | **API check-prescription** + **CDS Hooks** ให้ CPOE เรียก | API = **eMAC-now** / block จริง = **รอ CPOE** | กลาง–สูง |

---

## 3. วิเคราะห์รายข้อ (ลงรายละเอียด)

### ข้อ 1 — เมนูแจ้งขอประเมิน / ยืนยันแพ้ยา
**ปัจจุบัน:** คิวผู้ป่วยมาจาก ETL (IPD L51x) เท่านั้น และหน้าจอมีแค่ "ตรวจสอบ & ลงนาม" — ไม่มีแนวคิด "คำขอประเมิน" ที่บุคลากรแจ้งเข้ามา และ**สร้างเคสเองสำหรับผู้ป่วย walk-in/OPD ที่ไม่อยู่ใน ETL ไม่ได้**

**Gap:** ขาด (ก) entity "คำขอประเมิน", (ข) เมนู/สิทธิ์ให้แพทย์-พยาบาลแจ้ง, (ค) ปุ่มสร้างเคสเองของเภสัช

**ข้อเสนอ (รองรับทั้งสองทางตามที่ตกลง):**
- เพิ่มตาราง `allergy_assessment_request` : `requester_provider_id`, `requester_role`, `hospcode`, `patient_ref` (CID/HN/PID), `suspected_drugs[]`, `reason`, `source` (`ward` | `pharmacist` | `etl`), `status` (`requested → in_review → verified | rejected`)
- **ทางที่ 1 (ward แจ้ง):** แพทย์/พยาบาล login → "สร้างคำขอประเมินแพ้ยา" → เข้าคิวเภสัช
- **ทางที่ 2 (เภสัชสร้างเอง):** ปุ่ม "สร้างเคสใหม่" → ค้นผู้ป่วยด้วย CID/HN → เปิดฟอร์มประเมิน
- คิว ETL เดิมกลายเป็น `source='etl'` ในโมเดลเดียวกัน (รวมศูนย์)
- FE: เพิ่มแท็บ **"คำขอประเมิน"** + สถานะ + ปุ่มสร้างเคส; เพิ่ม role `nurse`/`doctor` ให้แจ้งได้
> **หมายเหตุ:** ปลายทางที่ดีที่สุดคือคำขอ **เกิดอัตโนมัติจาก HIS** (ตอนแพทย์ระบุสงสัยแพ้ยา) — ดูข้อ 4; ส่วนนี้รอ HIS แต่ตัว entity/เมนูทำใน eMAC ได้ก่อน

### ข้อ 2 — ทำงานซ้ำ 2 ระบบ (eMAC + HIS)
**ปัจจุบัน:** เภสัชบันทึกแพ้ยาใน eMAC และต้องไปบันทึกใน HIS อีกรอบ → ซ้ำซ้อน เสี่ยงข้อมูลไม่ตรง

**Gap:** ไม่มี single-entry, ไม่มี write-back ไป HIS

**ข้อเสนอ (FHIR-first):**
- ให้ eMAC เป็น **system of record ของ "แพ้ยาที่ยืนยัน + ลายเซ็น"** แล้ว **push เป็น FHIR `AllergyIntolerance`** กลับเข้า HIS อัตโนมัติเมื่อ verify (ผ่าน `HisConnector` port ที่มีอยู่)
- ทางเลือกลดการทำงานซ้ำ (เรียงตามความ seamless):
  1. **SMART on FHIR app launch** — เปิด eMAC จากในหน้า HIS พร้อม context ผู้ป่วย → เภสัชทำในจอเดียว ไม่ต้องสลับระบบ (ดีที่สุด)
  2. **Write-back FHIR** — บันทึกใน eMAC ครั้งเดียว แล้วยิง AllergyIntolerance เข้า HIS
  3. HIS เรียกอ่านจาก **FHIR API ของ eMAC** เอง
- eMAC-now: สร้าง **FHIR AllergyIntolerance facade** (map จาก `allergy_verification`/`allergy_card`) + เติม method ใน `HisConnector`
- รอ HIS: endpoint จริงของ HIS + ข้อตกลง auth (SMART launch)

### ข้อ 3 — ไม่มี use case ใช้ข้อมูล ณ point of care
**ปัจจุบัน:** มีบัตร + QR (ผู้ป่วยถือ/สแกนตรวจ) แต่**ฝั่งผู้ให้บริการยังไม่มีช่องทางดึงแพ้ยาของผู้ป่วยมาใช้ตอนสั่ง/จ่ายยา**

**Gap:** ไม่มี provider-facing query / alert ณ จุดบริการ

**ข้อเสนอ:**
- **API ดึงแพ้ยาตาม identity ผู้ป่วย:** `GET /api/v1/patients/by-cid/:cid/allergies` และในรูป FHIR `GET /fhir/AllergyIntolerance?patient=<cid>` (verified เท่านั้น)
- **จุดใช้งาน:** ห้องยา/OPD ดึงมาแสดงก่อนจ่ายยา; แสดง "แพ้ + cross-reactive ที่ต้องเลี่ยง"
- ต่อยอดเป็น **alert** เมื่อยาที่กำลังสั่งชนกับรายการแพ้ (เชื่อมข้อ 7)
- eMAC-now: read/query API (+ FHIR search); ฝังใน HIS = รอ partner

### ข้อ 4 — ไม่ integrate HIS / ไม่อยู่ใน flow หน่วยบริการ
**ปัจจุบัน:** ต้องล็อกอิน eMAC แยก, ค้นผู้ป่วยเอง — ไม่ได้อยู่ในเส้นทางทำงาน OPD/IPD/ห้องยา

**Gap:** ไม่มี context handoff จาก HIS, ไม่มีการฝังในจอทำงานจริง

**ข้อเสนอ (FHIR-first):**
- **SMART on FHIR / EHR launch**: HIS เปิด eMAC พร้อม `patient` + `encounter` context + token → ไม่ต้อง login/ค้นซ้ำ (สอดคล้องกับ MOPH Provider ID OIDC ที่ออกแบบไว้)
- **FHIR AllergyIntolerance** sync สองทาง (อ่าน/เขียน)
- **Deep-link / iframe** ปุ่ม "ตรวจสอบ/บันทึกแพ้ยา" + ธงเตือนบน patient banner ของ HIS
- eMAC-now: scaffold `/fhir/*` facade + endpoint รับ SMART launch (`/auth/launch`, `/auth/callback`) ; รอ HIS: vendor รองรับ SMART/FHIR

### ข้อ 5 — อาการแพ้ควรเป็นตัวเลือกรหัสมาตรฐาน (WHO-ART)
**ปัจจุบัน:** `manifestations` และ `adverseReaction` (ต่อยา) เป็น **free text** → วิเคราะห์/ส่งต่อ/ลงรหัส FHIR ไม่ได้

**Gap:** ข้อมูลไม่เป็นมาตรฐาน, สถิติ/ADR report ต่อยาก

**ข้อเสนอ:**
- เปลี่ยนช่องอาการเป็น **ตัวเลือก WHO-ART** (searchable dropdown, พิมพ์ค้นได้) เก็บเป็น `{ system:'WHO-ART', code, term }` (รองรับหลายอาการต่อยา)
- โมเดล: `allergy_verification.confirmed_drugs[].reactions[] = [{code, term}]` แทน free text
- Seed **ชุด WHO-ART** ที่พบบ่อยก่อน (เช่น rash, urticaria, angioedema, SJS, TEN, DRESS, anaphylaxis ...) — ชุดเต็มต้องดึงจากแหล่งมาตรฐาน (อย./HPVC)
- map ตรงกับ FHIR `AllergyIntolerance.reaction.manifestation` (CodeableConcept) → ต่อยอดข้อ 2 ได้ทันที
- eMAC-now: picker + seed subset; ต้องจัดหา: ชุดรหัส WHO-ART ฉบับสมบูรณ์ + สิทธิ์ใช้งาน

### ข้อ 6 — Cross-reactive ควรช่วยด้วย PHR + AI
**ปัจจุบัน:** cross-reactive เป็น free text ที่เภสัชพิจารณา/พิมพ์เอง — ไม่มีฐานความรู้ช่วย, ไม่มีประวัติยาข้ามหน่วยบริการ

**Gap:** พึ่งความจำ/การทบทวนด้วยมือ → ตกหล่น/ไม่ครบ

**ข้อเสนอ (ไล่จากทำได้ก่อน → อนาคต):**
1. **ฐานความรู้ drug class (deterministic ก่อน):** map `TMT (didstd) → ATC / กลุ่มเภสัชวิทยา / กลุ่มเคมี` แล้วมีตาราง `drug_cross_reaction` (เช่น beta-lactam, aromatic anticonvulsants: CBZ/phenytoin/phenobarbital, sulfonamides, NSAIDs) → **auto-suggest** กลุ่มที่ควรเลี่ยงจากยาที่ยืนยัน (เภสัชกดยืนยัน/แก้ได้)
2. **เชื่อม PHR (หมอพร้อม/PHR):** ดึงประวัติการใช้ยาข้ามหน่วยบริการ → ตรวจว่าเคยได้รับยาในกลุ่ม/ข้ามกลุ่มแล้วเป็นอย่างไร (ผ่าน `ConsentProvider`/PHR port)
3. **AI ช่วย:** จัดอันดับ/เสนอ cross-reactive + สรุปประวัติยา (ตัวช่วย ไม่ตัดสินแทน)
- eMAC-now: ข้อ (1) rule-based KB; รอ partner: (2) PHR, (3) AI

### ข้อ 7 — เชื่อม CPOE ระงับการสั่งยาทันเวลา
**ปัจจุบัน:** ออกแบบ P7 (`POST /check-prescription`) ไว้ แต่ยังไม่ทำ และไม่มี hook เข้ากับ CPOE

**Gap:** ไม่มีการเช็ก/บล็อกตอนสั่งยาจริง

**ข้อเสนอ:**
- **API `POST /api/v1/check-prescription { cid, drugs[tmt] }`** → คืน `{ block | warn, reasons[] }` (ชนรายการแพ้ยืนยัน + cross-reactive)
- **CDS Hooks service** (มาตรฐานสากลสำหรับ decision support บน CPOE): hook `medication-prescribe` / `order-sign` → CPOE เรียก eMAC ตอนสั่งยา → เด้ง card/alert หรือ hard-stop
- ประเด็น non-functional: latency ต่ำ + cache denylist (อัปเดตผ่าน EventBus `CardIssued` ที่ออกแบบไว้)
- eMAC-now: check API + CDS Hooks facade; รอ partner: CPOE เรียกจริง + policy การบล็อก

---

## 4. ทิศทางสถาปัตยกรรม (ภาพรวมที่ร้อยข้อ 2–7 เข้าด้วยกัน)

ธีมหลักจากเภสัช: eMAC ต้องเลิกเป็น "เว็บแยก" → กลายเป็น **บริการกลางที่ (ก) เสียบเข้า workflow HIS, (ข) ข้อมูลเป็นมาตรฐานลงรหัส, (ค) ถูกใช้ ณ จุดสั่ง/จ่ายยา**

แนวทาง **FHIR-native** (ตามที่เลือก):

- **Interchange:** FHIR `AllergyIntolerance` เป็นรูปแบบกลาง เข้า-ออก HIS (ข้อ 2,3,4)
- **Launch/SSO:** SMART on FHIR app launch + MOPH Provider ID (ข้อ 4)
- **Decision support:** CDS Hooks สำหรับ CPOE (ข้อ 7)
- **Terminology:** WHO-ART (อาการ), TMT (ยา — มีแล้วใน didstd), ATC (กลุ่มยา/cross-reactive), SNOMED (เผื่ออนาคต)
- คงหลัก **ports & adapters** เดิม → เพิ่ม `FhirGateway`, `TerminologyService`, `DrugKnowledgeBase`, `PhrProvider` เป็น port ใหม่ โดย business logic ไม่เปลี่ยน

---

## 5. โรดแมปจัดลำดับความสำคัญ (เสนอเป็น Phase ต่อจากของเดิม)

### รอบ A — ทำได้ใน eMAC ทันที (ไม่ต้องรอใคร) · ตอบข้อ 1, 5, 6(rule), 3/7(API)
| ลำดับ | งาน | ตอบข้อ | ผลลัพธ์ที่เภสัชเห็น |
|-------|-----|--------|---------------------|
| A1 | **เมนูคำขอประเมิน + สร้างเคสเอง** (entity `assessment_request`, ward แจ้ง / เภสัชสร้าง, ค้นด้วย CID/HN) | 1 | มีเมนูแจ้ง/รับคำขอชัดเจน, รองรับ walk-in |
| A2 | **WHO-ART picker** แทน free text (อาการต่อยา, เก็บ code+term) + seed ชุดพบบ่อย | 5 | เลือกอาการจากรายการมาตรฐาน |
| A3 | **Auto-suggest cross-reactive (rule-based)** จาก drug-class KB (TMT→ATC + `drug_cross_reaction` seed) | 6 (ส่วนแรก) | ระบบเสนอกลุ่มที่ควรเลี่ยงให้ ทบทวน/ยืนยัน |
| A4 | **Point-of-care API** `by-cid/:cid/allergies` + `POST /check-prescription` | 3, 7 (API) | มี use case ดึง/เช็กแพ้ยาตอนจ่ายยา |

### รอบ B — เตรียมพร้อม integrate (ทำ facade ฝั่ง eMAC ได้เลย, ต่อจริงเมื่อ partner พร้อม) · ตอบ 2, 4, 7
| ลำดับ | งาน | ตอบข้อ |
|-------|-----|--------|
| B1 | **FHIR `AllergyIntolerance` facade** (อ่าน/เขียน) + map จาก verified record | 2, 3, 4 |
| B2 | **CDS Hooks service** (`medication-prescribe`) เรียก check-prescription | 7 |
| B3 | **SMART on FHIR launch endpoints** (`/auth/launch`, context ผู้ป่วย) | 4 |

### รอบ C — ต้องรอ partner / ข้อมูลภายนอก · ตอบ 2, 4, 6(PHR+AI), 7(block จริง)
| ลำดับ | งาน | ขึ้นกับ |
|-------|-----|---------|
| C1 | HIS write-back จริง + SMART launch จาก HIS | vendor HIS รองรับ FHIR/SMART |
| C2 | เชื่อม PHR (หมอพร้อม) ดึงประวัติยาข้ามหน่วยบริการ | ข้อตกลง PHR + consent |
| C3 | AI ช่วยประเมิน cross-reactive / สรุปประวัติ | โมเดล AI + ข้อมูล |
| C4 | CPOE เรียก CDS Hooks + บล็อกจริง | CPOE vendor + policy |

---

## 6. สิ่งที่ต้องจัดหา/ยืนยันเพิ่ม (ก่อนหรือระหว่างทำ)

1. **ชุดรหัส WHO-ART** ฉบับที่ใช้จริง (อย./HPVC) + สิทธิ์ใช้งาน — รอบ A2 ตอนนี้จะ seed subset ที่พบบ่อยไปก่อน
2. **ตาราง TMT → ATC/กลุ่มยา** สำหรับ cross-reactive rule (A3) — มีแหล่งอ้างอิงไหม หรือให้ทำชุด seed กลุ่มเสี่ยง SJS/TEN ก่อน
3. **สิทธิ์/บทบาทผู้แจ้งคำขอ** (A1): ให้ `doctor` + `nurse` แจ้งได้ไหม (ตอนนี้มี doctor/pharmacist)
4. **FHIR profile ของ HIS นำร่อง** (B1/C1): version (R4?), endpoint, วิธี auth
5. **นิยาม policy การบล็อก CPOE** (C4): แพ้ยืนยัน = hard stop, cross-reactive = warn? ใครมีสิทธิ์ override

---

## 7. ข้อเสนอ "ก้าวแรก" (รอยืนยันก่อนลงมือ)

แนะนำเริ่ม **รอบ A** ตามลำดับ A1 → A2 → A3 → A4 (ทำใน eMAC ได้เลย เห็นผลกับเภสัชเร็ว และเป็นฐานข้อมูลมาตรฐานให้รอบ B/C ต่อ FHIR ได้สะอาด) โดยยังคงสไตล์แบ่ง Phase + test ราย Phase เหมือนที่ผ่านมา

> โปรดทบทวนเอกสารนี้ แล้วบอกว่า (ก) เห็นด้วยกับลำดับไหม (ข) จะเริ่มที่ A1 เลยหรือปรับลำดับ (ค) มีข้อมูลในหัวข้อ 6 ให้เพิ่มไหม — จากนั้นผมจะเริ่มปรับปรุงโค้ดตามที่ตกลง
