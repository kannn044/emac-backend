# คำตอบเอกสารขอใช้งานเชื่อมต่อ Provider ID (MOPH)

> ใช้กรอกข้อ **2.5 รายละเอียดระบบงาน** และ **2.6** ของแบบฟอร์มขอเชื่อมต่อ
> ระบบ: Drug Allergy Card API — ให้บริการที่ `https://api-mophlink.moph.go.th/drugallergy`

---

## ข้อ 2.5 — รายละเอียดระบบงาน

| ช่อง | ค่าที่กรอก |
|------|-----------|
| **ชื่อระบบ** | API DrugAllergy |
| **Public IP** | _(ระบุ IP สาธารณะของเซิร์ฟเวอร์ที่ deploy — ตัวที่จะเรียก/ถูก whitelist กับ MOPH)_ |
| **Redirect URL** | `https://api-mophlink.moph.go.th/drugallergy/auth/callback` |
| **จุดประสงค์การเชื่อมต่อ** | เพื่อยืนยันตัวตนบุคลากรทางการแพทย์ (แพทย์/เภสัชกร) ผ่าน Provider ID ก่อนเข้าใช้งานระบบตรวจสอบและยืนยันข้อมูลผู้ป่วยแพ้ยารุนแรง (SJS/TEN) และออกบัตรแพ้ยาอิเล็กทรอนิกส์ โดยบันทึก audit trail ว่าบุคลากรท่านใดเป็นผู้ยืนยัน |

### Checkbox ที่ต้องเลือก

| | รายการ | เลือก |
|---|--------|:---:|
| ☑ | **ล็อกอิน** | ✔ ต้องใช้ (login ด้วย Provider ID) |
| ☑ | **ขอชุดข้อมูล (Profiles: ProviderID)** — ระบุข้อ 2.6 | ✔ ต้องใช้ (ตรวจวิชาชีพ + หน่วยบริการ) |
| ☐ | ใช้ QR HealthID และ Authen code บน Kiosk | — ไม่ใช้ในเฟสนี้ |
| ☐ | ขอชุดข้อมูล PHR | — ไม่ใช้ |
| ☐ | ขอนำเข้าข้อมูล PHR | — ไม่ใช้ |
| ☐ | ขอใช้ API ออกใบรับรองแพทย์ | — ไม่ใช้ |

> **หมายเหตุ HealthID:** เฟสปัจจุบัน (ยืนยันโดยบุคลากร) ใช้เฉพาะ **ProviderID** ก็พอ
> ส่วน **HealthID** จะจำเป็นในเฟสถัดไป (การให้ผู้ป่วยยินยอม/แชร์บัตรผ่านหมอพร้อม)
> หากต้องการยื่นขอเผื่อล่วงหน้า ให้ติ๊ก HealthID เพิ่มในชุดเดียวกัน

---

## ข้อ 2.6 — ชุดข้อมูล (Profile) ที่ขอใช้

**Profile: Provider ID** — ขอ field ต่อไปนี้ (ใช้ตรวจสอบสิทธิ์ก่อนยืนยันข้อมูล):

| Field | เหตุผลการใช้งาน |
|-------|----------------|
| ชื่อ–นามสกุล | แสดงผู้ยืนยัน + ลงบนบัตรแพ้ยา (ผู้ออกบัตร) |
| เลขที่ใบประกอบวิชาชีพ (license) | ยืนยันเป็นบุคลากรทางการแพทย์จริง |
| ตำแหน่ง/วิชาชีพ (profession/role) | จำกัดสิทธิ์เฉพาะ **แพทย์/เภสัชกร** ที่ verify/stamp ได้ |
| รหัสหน่วยบริการ/โรงพยาบาล (hospcode 5 หลัก) | จำกัดการเข้าถึงข้อมูลเฉพาะ รพ. ของผู้ใช้ (tenant isolation) |
| สถานะการปฏิบัติงาน (active/inactive) | ปฏิเสธผู้ที่ลาออก/ถูกเพิกถอนใบอนุญาต |

> field เหล่านี้ระบบจะเรียกผ่าน `api/info` หลัง login (OIDC) — สอดคล้องกับ workflow.md §4
> ระบบ **ไม่เก็บ** ข้อมูลเกินจำเป็น และเข้ารหัส/มาส์กข้อมูลส่วนบุคคลตาม PDPA

---

## ข้อมูลเทคนิคประกอบ (เผื่อเจ้าหน้าที่ MOPH สอบถาม)

- **Protocol**: OpenID Connect (OIDC) — Authorization Code Flow
- **Redirect/Callback URI**: `https://api-mophlink.moph.go.th/drugallergy/auth/callback`
- **Endpoint ที่เรียกใช้**: `/.well-known/openid-configuration`, JWKS, `api/info`
- **Logout (ถ้ามี)**: `https://api-mophlink.moph.go.th/drugallergy/auth/logout`
- **การใช้ข้อมูล**: ตรวจวิชาชีพ + hospcode เพื่อออก session ภายในระบบ (ไม่ส่งต่อบุคคลที่สาม)

> ถ้า MOPH ต้องการ redirect URL สำหรับ **sandbox/ทดสอบ** ให้แจ้งเพิ่ม เช่น
> `https://api-mophlink.moph.go.th/drugallergy/auth/callback` (prod) และโดเมน staging (ถ้ามี)

---

## สิ่งที่ต้องเตรียมเติมเอง

1. **Public IP** ของเซิร์ฟเวอร์ที่ deploy (ขอจากทีม infra/เครือข่าย)
2. ยืนยันว่า MOPH รองรับ **path-based redirect** (`/drugallergy/auth/callback`) — โดยทั่วไป OIDC
   ตรวจ redirect_uri แบบ exact match จึงต้องลงทะเบียน URL นี้ให้ตรงเป๊ะ
3. หากต้องการเปิดฟีเจอร์ consent ผู้ป่วย (หมอพร้อม) ในอนาคต → ขอ **HealthID** เพิ่ม
