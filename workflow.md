# Workflow — ระบบ Drug Allergy Card API (National Scale)

> เอกสารออกแบบ workflow / สถาปัตยกรรม สำหรับ API ระบบบัตรแพ้ยาอิเล็กทรอนิกส์
> Stack: **Node.js + TypeScript + Express**, **PostgreSQL**, deploy บน **Linux server**
> สถานะ: Draft v0.2 — เพิ่ม digital signing (HSM/KMS) + outbound consent (หมอพร้อม) — รอ review ก่อนลงมือ implement
> อ้างอิง: `init.md` (Knowledge Base จากการประชุม), `sjs-ten.ipynb` + `sjs-ten-ipd-drug.ipynb` (Pipeline Step 1)

---

## 0. ขอบเขตของเอกสารฉบับนี้ (Scope)

ครอบคลุม **Phase 1: Verification Portal + Signed E-Allergy Card + Patient Consent (หมอพร้อม)** ตามที่ตกลง:

1. Pipeline Step 1 → วางข้อมูลลง storage ฝั่ง API (cronjob ทุก 24 ชม.)
2. Authentication ผ่าน **MOPH Provider ID** (OIDC) + ตรวจ `api/info` ว่าเป็นบุคลากรการแพทย์จริง + รพ. มีจริง (รหัส 5 หลัก) → **enroll คู่กุญแจ (keypair)** ผูกกับ provider id ตอนใช้งานครั้งแรก
3. API list ผู้ป่วยแพ้ยา **เฉพาะโรงพยาบาลของ user** จากตาราง `patient_drugallergy`
4. เภสัชกร/แพทย์ verify (เทียบ HIS แบบ manual) → เลือกยาที่เป็นสาเหตุ → **digital sign ด้วย private key** → `stamp` / `edit` / `reject`
5. ออก **Signed E-Allergy Card** (iframe HTML preview + PDF ถาวร) ที่ลงนามด้วย private key ของผู้ออก และตรวจสอบความแท้ได้ด้วย public key ฝั่ง server
6. **ขาออก (Outbound + Consent)**: เปิด API ให้ **HIS / แอปหมอพร้อม** ดึง allergy card ไปแสดงที่ รพ. อื่นได้ ผ่าน **consent ของผู้ป่วย** (รพ. แสดง QR → ผู้ป่วยสแกนด้วยหมอพร้อมเพื่อยินยอม) + ผู้ป่วยจัดการ/ถอน consent ได้เอง

**อยู่นอก Phase 1 (ออกแบบเผื่อไว้ ไม่ implement ตอนนี้):**

- National Drug-Blocking API สำหรับ HIS 30+ vendors เรียกเช็ค/ล็อกการสั่งจ่ายยา (init.md ข้อ 4) → ดู §11 (Future Vision)
- HIS integration อัตโนมัติสำหรับ pre-fill (init.md ข้อ 2) → ออกแบบเป็น interface เผื่อไว้ใน §6.4

---

## 1. ภาพรวมสถาปัตยกรรม (High-Level Architecture)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          DATA / ANALYTICS ZONE                             │
│                                                                            │
│   HDC DuckDB (db.db)                                                       │
│   person / drug_opd / drug_ipd / diagnosis_ipd                             │
│        │                                                                   │
│        ▼   Pipeline Step 1 (notebooks → production script)                 │
│   [1] sjs-ten        : diagnosis_ipd L51%  → admit list                    │
│   [2] sjs-ten-ipd-drug: cross-hospital retro drug search (via CID)         │
│        │                + TMT/classification (NSAID/ABX/Allo/CBZ)          │
│        ▼                                                                    │
│   Staging output (patient-level rows)                                      │
└────────┬───────────────────────────────────────────────────────────────────┘
         │  ETL Loader (cronjob ทุก 24 ชม.)  — UPSERT, ไม่ทับ state ที่ verify แล้ว
         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       APPLICATION ZONE  (PostgreSQL)                       │
│   patient_drugallergy      ← ข้อมูลตั้งต้นจาก pipeline (read-heavy)         │
│   allergy_verification     ← state: pending/verified/rejected + audit      │
│   allergy_card             ← บัตรที่ออกแล้ว (immutable)                     │
│   verification_audit_log   ← ใครทำอะไรเมื่อไหร่ (audit trail)               │
│   rejected_records         ← record ที่ถูก reject (แยกออกจากข้อมูลจริง)      │
└────────┬───────────────────────────────────────────────────────────────────┘
         │  Node + TS + Express  (REST API, stateless, behind Nginx + PM2)
         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│   MOPH Provider ID (OIDC)  ◄── verify JWT (JWKS) + GET api/info ──┐         │
│      └─ คืน: ตำแหน่ง/วิชาชีพ, hospcode 5 หลัก, ชื่อ-สกุล           │         │
│                                                                  │         │
│   HSM / KMS  ◄── gen+เก็บ private key ผูก provider id, sign ───────┘         │
│                                                                            │
│   INBOUND — Frontend ฝั่ง Third-party (ระบบเดิมของ รพ. / HIS vendor)        │
│   - login ด้วย Provider ID → API ตรวจ api/info → enroll keypair            │
│   - list ผู้ป่วย → verify (sign) → preview/issue signed card (iframe)        │
│                                                                            │
│   OUTBOUND — แอปหมอพร้อม (Mor Prom) / HIS รพ. ปลายทาง                       │
│   - รพ.ปลายทางแสดง QR → ผู้ป่วยสแกนด้วยหมอพร้อม → consent                   │
│   - รพ.ปลายทางได้ scoped token → ดึง signed card → verify ด้วย public key   │
│   - ผู้ป่วยดู card/QR, จัดการ/ถอน consent บนหมอพร้อม                        │
└──────────────────────────────────────────────────────────────────────────┘
```

**หลักการออกแบบ:**

- **Stateless API** — token-based, scale แนวนอนได้ (หลาย instance หลัง load balancer)
- **Tenant isolation by `hospcode`** — ทุก query กรองด้วย hospcode จาก token เสมอ (กันข้อมูลข้าม รพ.)
- **แยก data plane ออกจาก control plane** — pipeline เขียนเฉพาะตารางตั้งต้น, การ verify เขียนคนละตาราง ไม่ชนกัน
- **Immutability ของข้อมูลที่ verify แล้ว** — final record เป็น read-only ตาม init.md ข้อ 2

---

## 2. Pipeline Step 1 → Storage (Batch ทุก 24 ชม.)

### 2.1 สรุป Logic จาก notebook (สิ่งที่ pipeline ทำอยู่แล้ว)

| ขั้น | Notebook | สาระสำคัญ |
|------|----------|-----------|
| 1. หา admit | `sjs-ten.ipynb` | `diagnosis_ipd WHERE diagcode LIKE 'L51%'` → normalize เป็น L511/L512/L519 → `(HOSPCODE, PID, DIAGCODE, DATETIME_ADMIT)` |
| 2. ดึงยาย้อนหลังข้าม รพ. | `sjs-ten-ipd-drug.ipynb` | resolve `CID` จาก `person` → ขยายเป็นทุกคู่ `(HOSPCODE,PID)` ของ CID เดียวกัน → ดึง `drug_opd.DATE_SERV` + `drug_ipd.DATESTART` ที่ `<= admit_date` → aggregate เป็น `DIDSTD` (TMT std), `DNAME`, `DATE_SERV` |
| 3. classify | เดียวกัน | regex classifier: NSAID groups, Antibiotic groups, Allopurinol, Carbamazepine → `*_groups_received` ระดับผู้ป่วย |

> **หมายเหตุสำคัญ (init.md ข้อ 1):** การดึงยาย้อนหลังควรจำกัด window = **1 เดือนก่อน admit** (ไม่ใช่ทั้งหมด). notebook ปัจจุบันใช้ `DATE_SERV <= admit_date` (ไม่มี lower bound) → production script ต้องเพิ่ม `AND drug_date >= admit_date - INTERVAL 30 DAY`. ขอยืนยันก่อน implement (ดู Open Questions Q1).

### 2.2 Production ETL Loader

แปลง notebook → สคริปต์ที่รันเป็น cronjob ได้ (Python หรือ Node ก็ได้ — แนะนำ Python เพราะ logic อยู่ใน pandas/duckdb แล้ว):

```
cron: 0 2 * * *   # ทุกวัน 02:00 (ช่วง low-traffic)
```

ขั้นตอนของ loader:

1. รัน DuckDB query (step 1+2) บน HDC → ได้ patient-level dataframe
2. classify (NSAID/ABX/Allo/CBZ) + map TMT 24 หลัก
3. คำนวณ `natural_key` = `hash(hospcode || pid || datetime_admit || diagcode)` เพื่อ idempotent UPSERT
4. **UPSERT** เข้า `patient_drugallergy`:
   - row ใหม่ → insert สถานะ `pending`
   - row เดิมที่ **ยังไม่ถูก verify/reject** → update payload ยาได้
   - row เดิมที่ **verified แล้ว** → **ห้ามแตะ** (skip; เก็บ log ว่า source เปลี่ยน เพื่อ review)
5. เขียน `etl_run_log` (เริ่ม/จบ, จำนวน insert/update/skip, error)

> ทำเป็น **idempotent batch** — รันซ้ำได้ไม่พัง ข้อมูล verify ไม่หาย. ETL ควรเขียนผ่าน transaction + advisory lock กัน cron ซ้อนรอบ.

### 2.3 ทำไม PostgreSQL ไม่ใช่ Parquet ล้วน

ข้อมูลตั้งต้นอ่านอย่างเดียวก็จริง แต่ระบบนี้มี **write state ตลอดเวลา** (verify/stamp/edit/reject) + ต้องการ audit trail, row-level security ราย รพ., และ join ข้าม 4-5 ตาราง. Parquet ทำ transactional write/lock ราย record ไม่ได้ดี. เลือก Postgres เป็นหลัก, partition ตาม `hospcode` (หรือ `zone_code`) เพื่อ scale; ข้อมูลดิบจาก pipeline เก็บ archive เป็น Parquet คู่ขนานได้เพื่อ re-load.

---

## 3. Database Schema (PostgreSQL)

```sql
-- ตารางตั้งต้นจาก pipeline (UPSERT โดย ETL ทุก 24 ชม.)
CREATE TABLE patient_drugallergy (
    id                  BIGSERIAL PRIMARY KEY,
    natural_key         TEXT UNIQUE NOT NULL,        -- idempotent key จาก ETL
    hospcode            CHAR(5) NOT NULL,            -- รพ. ที่ admit (= tenant key)
    pid                 TEXT NOT NULL,
    cid                 TEXT,                        -- เลขบัตร ปชช. (ใช้ cross-hospital)
    hn                  TEXT,                        -- HN จาก person (ช่วยเภสัชเทียบ HIS)
    diagcode            TEXT NOT NULL,               -- L511 / L512 / L519
    datetime_admit      DATE NOT NULL,
    -- ยาที่ต้องสงสัย (จาก retro search ข้าม รพ.)
    suspect_drugs       JSONB NOT NULL,              -- [{didstd, tmt24, dname, date_serv, src_hospcode, group}]
    nsaid_groups        TEXT[],
    systemic_nsaids     TEXT[],
    antibiotic_groups   TEXT[],
    other_groups        TEXT[],                      -- Allopurinol, Carbamazepine ฯลฯ
    status              TEXT NOT NULL DEFAULT 'pending',  -- pending|verified|rejected
    source_loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY LIST (hospcode);     -- หรือ partition ตาม zone_code สำหรับสเกลประเทศ

CREATE INDEX ix_pda_hospcode_status ON patient_drugallergy (hospcode, status);
CREATE INDEX ix_pda_cid ON patient_drugallergy (cid);

-- คู่กุญแจของบุคลากร (public key เก็บที่นี่, private key อยู่ใน HSM/KMS)
CREATE TABLE provider_signing_key (
    id                  BIGSERIAL PRIMARY KEY,
    provider_id         TEXT NOT NULL,                -- จาก MOPH Provider ID
    hospcode            CHAR(5) NOT NULL,             -- รพ. ณ ตอน enroll (จาก api/info)
    kms_key_id          TEXT NOT NULL,                -- handle ใน HSM/KMS (ไม่ใช่ private key)
    public_key          TEXT NOT NULL,               -- PEM/JWK สำหรับให้คนอื่นตรวจลายเซ็น
    algorithm           TEXT NOT NULL DEFAULT 'Ed25519',
    key_version         INT NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'active', -- active | rotated | revoked
    enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at          TIMESTAMPTZ,
    UNIQUE (provider_id, key_version)
);
CREATE INDEX ix_psk_provider ON provider_signing_key (provider_id, status);

-- สถานะการ verify (control plane — เขียนโดย API)
CREATE TABLE allergy_verification (
    id                  BIGSERIAL PRIMARY KEY,
    patient_record_id   BIGINT NOT NULL REFERENCES patient_drugallergy(id),
    hospcode            CHAR(5) NOT NULL,
    -- ยาที่ "จิ้ม" ว่าเป็นสาเหตุจริง (init.md ข้อ 2)
    confirmed_drugs     JSONB NOT NULL,              -- subset ของ suspect_drugs
    cross_reaction      JSONB,                       -- กลุ่มยา cross-reaction ที่ต้อง block ด้วย
    note                TEXT,                         -- หมายเหตุเภสัช (edit)
    decision            TEXT NOT NULL,                -- verified | rejected
    verified_by_provider_id  TEXT NOT NULL,           -- จาก MOPH token (audit)
    verified_by_name    TEXT NOT NULL,
    verified_by_role    TEXT NOT NULL,                -- doctor | pharmacist
    -- ลายเซ็นดิจิทัลของ "การตัดสิน verify" (non-repudiation)
    decision_signature  TEXT NOT NULL,                -- base64 ลายเซ็นของ canonical payload
    signing_key_id      BIGINT NOT NULL REFERENCES provider_signing_key(id),
    signed_payload_hash TEXT NOT NULL,                -- sha256 ของสิ่งที่ถูก sign
    verified_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- บัตรที่ออกแล้ว (immutable — read only) + ลายเซ็นดิจิทัล
CREATE TABLE allergy_card (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id     BIGINT NOT NULL REFERENCES allergy_verification(id),
    patient_record_id   BIGINT NOT NULL REFERENCES patient_drugallergy(id),
    hospcode            CHAR(5) NOT NULL,
    cid                 TEXT NOT NULL,                 -- ใช้จับคู่ consent ขาออก
    card_payload        JSONB NOT NULL,               -- snapshot ทุก field บนบัตร (canonical)
    card_signature      TEXT NOT NULL,                 -- base64 ลายเซ็นของ card_payload
    signing_key_id      BIGINT NOT NULL REFERENCES provider_signing_key(id),
    signed_payload_hash TEXT NOT NULL,                 -- sha256 ของ card_payload
    pdf_path            TEXT,                          -- ที่เก็บ PDF (object storage)
    render_token        TEXT UNIQUE NOT NULL,          -- token สำหรับ iframe (signed, หมดอายุได้)
    issued_by_provider_id TEXT NOT NULL,
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at          TIMESTAMPTZ                     -- เผื่อกรณีพิสูจน์ภายหลังว่าไม่แพ้
);

-- consent ขาออก: ผู้ป่วยยินยอมให้ รพ.ปลายทาง/หมอพร้อม เข้าถึง card
CREATE TABLE allergy_consent (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cid                 TEXT NOT NULL,                 -- เจ้าของข้อมูล (ผู้ป่วย)
    grantee_hospcode    CHAR(5),                       -- รพ.ปลายทางที่ได้รับอนุญาต
    grantee_type        TEXT NOT NULL,                 -- hospital | morprom
    scope               TEXT NOT NULL DEFAULT 'read_card',
    consent_request_id  TEXT,                          -- ผูกกับ QR ที่ รพ.ปลายทางสร้าง
    granted_via         TEXT NOT NULL DEFAULT 'morprom_qr',
    status              TEXT NOT NULL DEFAULT 'active', -- active | revoked | expired
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ,                    -- consent หมดอายุได้
    revoked_at          TIMESTAMPTZ
);
CREATE INDEX ix_consent_cid ON allergy_consent (cid, status);

-- คำขอ consent ที่ รพ.ปลายทางสร้าง (QR) รอผู้ป่วยสแกนอนุมัติ
CREATE TABLE consent_request (
    id                  TEXT PRIMARY KEY,              -- ฝังใน QR
    requester_hospcode  CHAR(5) NOT NULL,             -- รพ.ปลายทางที่ขอ
    requester_provider_id TEXT,
    status              TEXT NOT NULL DEFAULT 'pending', -- pending|approved|denied|expired
    cid                 TEXT,                          -- เติมเมื่อผู้ป่วยสแกน/อนุมัติ
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL           -- QR อายุสั้น (เช่น 5 นาที)
);

-- record ที่ถูก reject (แยกตาราง ไม่ปนข้อมูลจริง — init.md ข้อ 2)
CREATE TABLE rejected_records (
    id                  BIGSERIAL PRIMARY KEY,
    patient_record_id   BIGINT NOT NULL,
    hospcode            CHAR(5) NOT NULL,
    snapshot            JSONB NOT NULL,                -- ข้อมูล ณ ตอน reject
    reason              TEXT,
    rejected_by_provider_id TEXT NOT NULL,
    rejected_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- audit trail ทุก action (ดู/แก้/stamp/reject/issue/print)
CREATE TABLE verification_audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    actor_provider_id   TEXT NOT NULL,
    actor_role          TEXT NOT NULL,
    hospcode            CHAR(5) NOT NULL,
    action              TEXT NOT NULL,                 -- VIEW|EDIT|STAMP|REJECT|ISSUE_CARD|PRINT
    patient_record_id   BIGINT,
    detail              JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**State machine ของ record:**

```
pending ──(stamp/verify)──► verified ──► [allergy_card issued]
   │
   └──────(reject)────────► rejected   (snapshot ย้ายไป rejected_records)

verified = read-only; แก้ได้เฉพาะกรณีพิสูจน์ภายหลัง → revoke (audit เต็ม)
```

---

## 4. Authentication, Identity Verification & Key Enrollment (MOPH Provider ID)

### 4.1 Flow (OIDC + api/info + Key Enrollment)

การเข้าใช้งานทุกครั้ง (list/verify) ผ่าน 3 ชั้น: **(1) login OIDC → (2) ตรวจตัวตนบุคลากรผ่าน `api/info` → (3) enroll/โหลด keypair**

```
Frontend(ระบบ รพ.)     API (Express)            MOPH Provider ID        HSM/KMS
  │ login                                              │                    │
  │ ─── redirect authorize ───────────────────────────►│                    │
  │ ◄────────── authcode ──────────────────────────────│                    │
  │ ── code ─► /auth/callback                           │                    │
  │           │ ── exchange code → access_token ───────►│                    │
  │           │ ◄──── id_token + access_token ──────────│                    │
  │           │ verify JWT (JWKS)                       │                    │
  │           │ ── GET api/info (Bearer access_token) ─►│                    │
  │           │ ◄── {position, license, hospcode(5),    │                    │
  │           │      name, isActive} ───────────────────│                    │
  │           │ ตรวจ: เป็นบุคลากรการแพทย์จริง?           │                    │
  │           │       hospcode มีจริงใน master รพ.?      │                    │
  │           │ ── enroll: มี keypair ของ providerId? ──────────────────────►│
  │           │      ถ้าไม่มี → gen Ed25519 keypair, เก็บ private ใน KMS ────►│
  │           │      บันทึก public key + providerId + hospcode (ตาราง)       │
  │ ◄── session JWT (ของระบบเรา) ──┘                                          │
  │ เรียก API ทุก request แนบ Bearer <session JWT>                            │
```

**กฎการยืนยันตัวตน (ก่อนให้ทำอะไรได้):**

1. JWT จาก MOPH ต้อง verify signature ผ่าน JWKS + ยังไม่หมดอายุ
2. เรียก `GET {provider}/api/info` ด้วย access_token → ต้องได้ว่า **เป็นบุคลากรทางการแพทย์จริง** (มีเลขใบประกอบวิชาชีพ/ตำแหน่งที่อนุญาต) และ **`hospcode` 5 หลักตรงกับ master รพ.** ที่มีอยู่จริง
3. ถ้าผ่าน → enroll keypair (ครั้งแรก) หรือโหลด key handle (ครั้งถัดไป) → ออก session JWT ของระบบเรา (อายุสั้น) ที่ฝัง `{ providerId, hospcode, role, name, keyId }`
4. ถ้าไม่ผ่านข้อใดข้อหนึ่ง → ปฏิเสธ (ไม่ enroll, ไม่ออก session)

> **สมมติฐาน (รอยืนยัน — Q2):** MOPH Provider ID เป็น OIDC provider มี `/.well-known/openid-configuration` + JWKS + endpoint `api/info` ที่คืนข้อมูลบุคลากร (ตำแหน่ง/วิชาชีพ, hospcode 5 หลัก, ชื่อ-สกุล, สถานะ active). ชื่อ field จริงอาจต่าง → ปรับเฉพาะ `AuthProvider` adapter (§4.4) ส่วนอื่นไม่ต้องแก้.

### 4.2 Key Enrollment & Custody (Server-side HSM/KMS)

- **เมื่อใด**: ตอนแพทย์/เภสัช "เข้าใช้งานครั้งแรก" (ครั้งแรกที่ผ่าน auth + api/info สำเร็จ ไม่ว่าจะมาทำ list หรือ verify)
- **อะไร**: server สร้าง **asymmetric keypair (แนะนำ Ed25519 หรือ ECDSA P-256)** หนึ่งคู่ต่อ `providerId`
- **เก็บที่ไหน**: **private key อยู่ใน HSM/KMS** (เช่น AWS KMS / HashiCorp Vault Transit / PKCS#11 HSM) — แอปถือแค่ `keyId` (handle) ไม่เคยเห็น private key ดิบ; **public key + providerId + hospcode** เก็บในตาราง `provider_signing_key`
- **การ sign**: ตอน verify/ออก card แอปส่ง payload hash ไปให้ KMS `Sign(keyId, hash)` → ได้ลายเซ็น (private key ไม่ออกจาก KMS)
- **การตรวจสอบ**: ใครก็ตาม (HIS/หมอพร้อม/รพ.ปลายทาง) ขอ public key จาก endpoint สาธารณะ `GET /api/v1/keys/:providerId` (หรือ JWKS ของระบบเรา) มาตรวจลายเซ็นได้เอง
- **ข้อจำกัดที่ยอมรับ (เลือก Server-side)**: server เป็นผู้ถือ private key ผ่าน KMS → non-repudiation อ่อนกว่าแบบ client-side แต่แลกกับการ integrate ง่ายและ ops ระดับประเทศ; ชดเชยด้วย **audit log + KMS access policy + key rotation** (ดู §4.3)

### 4.3 Key Lifecycle

- **Rotation**: หมุน key ตามรอบ (เช่นปีละครั้ง) — เก็บ public key เก่าไว้ตรวจ card ที่ออกด้วย key เดิม (`key_version`)
- **Revoke**: ถ้าบุคลากรลาออก/ถูกเพิกถอนใบอนุญาต → mark key เป็น revoked (card เดิมยังตรวจได้ แต่ออกใหม่ไม่ได้)
- **ผูกกับ api/info ทุก session**: ถ้า api/info บอกว่า inactive/ย้าย รพ. → ปรับ hospcode/สถานะ key ตาม

### 4.4 Auth abstraction (เผื่อ Provider ID เปลี่ยน format)

```ts
interface AuthProvider {
  exchangeCode(code: string): Promise<MophToken>;
  verify(jwt: string): Promise<Claims>;
  getInfo(accessToken: string): Promise<ProviderInfo>; // GET api/info → {position, license, hospcode, name, isActive}
}
interface KeyService {
  ensureEnrolled(providerId: string, hospcode: string): Promise<{ keyId: string; publicKey: string }>;
  sign(keyId: string, data: Buffer): Promise<Buffer>;   // private key ไม่ออกจาก HSM/KMS
  getPublicKey(providerId: string, version?: number): Promise<string>;
}
```

### 4.5 Middleware

ทุก protected endpoint ผ่าน middleware:

1. ตรวจ Bearer token (session JWT ของระบบ) — signature + expiry
2. ดึง `{ hospcode, providerId, role, name }` จาก token เป็น `req.ctx`
3. **บังคับ tenant scope**: ทุก query ใส่ `WHERE hospcode = req.ctx.hospcode` อัตโนมัติ (ระดับ repository layer ไม่ใช่ caller — กัน bug หลุดข้าม รพ.)
4. **RBAC**: doctor/pharmacist เท่านั้นที่ stamp/reject ได้ (init.md ข้อ 2)
5. **ตรวจ enrollment**: ต้องมี `keyId` ที่ active สำหรับ providerId นี้ (ถ้ายังไม่มี → trigger enroll ก่อน)

---

## 5. การ List ผู้ป่วย (Tenant-scoped)

`GET /api/v1/patients?status=pending&page=1&q=...`

- กรองด้วย `hospcode = req.ctx.hospcode` เสมอ (จาก token, ห้ามรับจาก query)
- filter ได้: `status`, ช่วงวัน admit, diagcode, กลุ่มยา, ค้นหา HN/PID
- ส่งกลับ: รายชื่อผู้ป่วย + ยาที่ต้องสงสัย + สถานะ verify + paging
- ทุกการเรียกเขียน `verification_audit_log` action=`VIEW` (สำหรับ record ที่เปิด detail)

`GET /api/v1/patients/:id` → รายละเอียดเต็ม: รายการยาทั้งหมด (suspect_drugs) พร้อม source hospcode + วันที่ได้ยา + TMT + กลุ่ม cross-reaction ที่เกี่ยวข้อง เพื่อให้เภสัชเทียบกับ HIS

---

## 6. Verification Flow (เภสัช/แพทย์)

### 6.1 ขั้นตอนบนหน้าจอ (plug-in เข้าระบบเดิม)

1. เภสัชเปิด record → เห็นยาที่ต้องสงสัยทั้งหมด (อาจหลายตัว เช่น 5 ตัว)
2. เภสัชเปิด **HIS ของ รพ.** คู่กัน → เทียบว่าข้อมูลตรงกันไหม (Phase 1 = manual)
3. เภสัช **"จิ้ม" เลือกยาที่เป็นสาเหตุจริง** (1..n ตัว) — init.md ข้อ 2
4. ระบบเสนอ **กลุ่ม cross-reaction** ของยาที่เลือก (ยาโครงสร้างคล้าย 10-20 ตัวที่ควร block ด้วย) ให้เภสัชยืนยัน/ปรับ
5. ใส่ note เพิ่มได้ (Edit)
6. กด **Preview** → ดูหน้าตาบัตรก่อน (init.md ข้อ 3)
7. กด **Stamp/Verify** → ระบบ **sign decision + card ด้วย private key (ผ่าน KMS)** → ออกบัตรที่ลงนามแล้ว / หรือ **Reject**

### 6.1.1 ขั้นตอนการลงนาม (Signing) ตอน Verify

```
เภสัช/แพทย์ กด Stamp
   │
   ▼
สร้าง canonical payload ของ "decision" {patient_record_id, confirmed_drugs, cross_reaction, providerId, ts}
   │  sha256 → hash
   ▼
KMS.sign(keyId, hash)  ──►  decision_signature        (private key ไม่ออกจาก KMS)
   │
   ▼
สร้าง canonical payload ของ "card" {ข้อมูลบนบัตรทั้งหมด, verificationId}
   │  sha256 → hash
   ▼
KMS.sign(keyId, hash)  ──►  card_signature
   │
   ▼
TRANSACTION: insert allergy_verification(+signature) → update status=verified
             → insert allergy_card(+signature) → audit log
```

ใครก็ตรวจได้ภายหลัง: ดึง `public_key` ของ providerId → ตรวจ `card_signature` กับ `card_payload` → ยืนยันว่าบัตรออกโดยบุคลากรคนนั้นจริงและไม่ถูกแก้.

### 6.2 Endpoints

| Method | Path | หน้าที่ |
|--------|------|---------|
| `POST` | `/api/v1/patients/:id/verify` | ยืนยัน: ส่ง `confirmed_drugs[]`, `cross_reaction`, `note` → **sign decision + card** → สร้าง `allergy_verification` (decision=verified, +signature), set record=verified, ออก signed card |
| `POST` | `/api/v1/patients/:id/reject` | ปฏิเสธ: ส่ง `reason` → snapshot ไป `rejected_records`, set record=rejected |
| `PATCH`| `/api/v1/patients/:id/note` | แก้ไข/เพิ่มหมายเหตุ (ก่อน stamp) |
| `POST` | `/api/v1/patients/:id/card/preview` | render บัตร (ยังไม่บันทึก) → คืน HTML/URL สำหรับ iframe preview |

> ทุก action เขียน `verification_audit_log` พร้อม `providerId`, role, timestamp (init.md: audit trail บังคับ).
> `verify` ทำใน **transaction เดียว**: insert verification → update status → insert card → log. ถ้า fail rollback ทั้งหมด.

### 6.3 Cross-reaction logic

ต้องมีตาราง mapping (seed จากความรู้ทางเภสัช + TMT/มาตรฐาน 24 หลัก):

```sql
CREATE TABLE drug_cross_reaction (
    drug_group     TEXT,          -- เช่น "Allopurinol"
    related_group  TEXT,          -- กลุ่มที่ต้อง block ด้วย
    tmt24_list     TEXT[]         -- รายการ TMT 24 หลักที่ครอบคลุม
);
```

เมื่อเภสัชเลือกยา → ระบบดึง related groups มาเสนอ → ที่ verify แล้วจะถูกใช้เป็น "บัญชียาห้ามจ่าย" ของผู้ป่วยรายนั้น (เตรียมต่อยอด national blocking API ใน §10).

### 6.4 HIS verification interface (เผื่อ Phase ถัดไป)

Phase 1 = manual (เภสัชดูจอ HIS เอง). ออกแบบ interface ไว้ก่อน:

```ts
interface HisConnector {
  getPatientAllergyHistory(hospcode: string, hn: string): Promise<HisAllergyRecord[]>;
}
```

เมื่อพร้อม integrate รายว vendor → implement connector แล้วให้ระบบ pre-fill/highlight ความตรงกันอัตโนมัติ โดยไม่ต้องแก้ flow หลัก.

---

## 7. E-Allergy Card Generation

### 7.1 Trigger & ข้อมูลบนบัตร

บัตรถูกสร้าง **เฉพาะหลัง stamp** (init.md ข้อ 3). Field บนบัตร (snapshot ลง `allergy_card.card_payload`):

- ชื่อผู้ป่วย, HN, เลขบัตร ปชช. (mask บางส่วน)
- ชื่อแพทย์/เภสัชผู้ออกบัตร (จาก Provider ID)
- ชื่อโรงพยาบาลที่รักษาอาการแพ้ (จาก hospcode)
- วันที่ admit + วันที่ได้รับยาที่แพ้
- สรุปรายการยาที่แพ้ (ยาที่ confirm) + กลุ่ม cross-reaction ที่ต้องเลี่ยง
- เลขอ้างอิงบัตร (UUID) + วันที่ออก
- **ลายเซ็นดิจิทัล + QR ตรวจสอบความแท้**: QR ฝัง `card_id` + URL ตรวจสอบ → สแกนแล้วเช็ค `card_signature` กับ public key ของผู้ออก → ยืนยันว่าบัตรจริง ไม่ถูกแก้

> **หลายใบได้**: ถ้าแพ้ยาหลายตัวแยกกัน → ออกได้หลาย card (หลาย verification) ตาม init.md ข้อ 3.

### 7.2 การ render (iframe + PDF)

- **iframe preview/แสดงผล**: `GET /embed/card/:render_token` → คืนหน้า HTML บัตรเต็ม (ไม่มี chrome ของระบบ) ให้ frontend ฝัง `<iframe>`. ใช้ **signed render_token** (หมดอายุได้, ผูกกับ card + hospcode) แทนการส่ง session — ปลอดภัยกับการ embed.
- **PDF ถาวร**: ตอน issue ใช้ headless render (Puppeteer/Chromium) จาก template เดียวกัน → เก็บไฟล์ลง object storage → `pdf_path`. ใช้ทั้ง print และเก็บหลักฐาน.
- Template เดียว ใช้ทั้ง preview / issue / PDF → หน้าตาตรงกัน 100%.
- ใส่ security headers สำหรับ embed (`X-Frame-Options`/`Content-Security-Policy: frame-ancestors` allowlist เฉพาะ domain ของระบบ รพ. ที่อนุญาต).

### 7.3 การตรวจสอบความแท้ (Public-key Verification)

ทุก signed card ตรวจสอบได้โดยไม่ต้อง login:

```
GET /api/v1/cards/:id/verify
  → คืน { valid: true/false, issuer, hospcode, issued_at, signature_algorithm }
  → server โหลด public_key (ตาม signing_key_id/version) แล้วตรวจ card_signature กับ card_payload hash
```

public key เปิดให้ดึงได้ที่ `GET /api/v1/keys/:providerId` (หรือ JWKS รวม) — HIS/หมอพร้อม/รพ.ปลายทาง นำไปตรวจเองได้โดยไม่ต้องเชื่อใจ server เพียงอย่างเดียว.

---

## 8. Outbound: Patient Consent & การแชร์ข้ามโรงพยาบาล (หมอพร้อม / HIS)

เป้าหมาย: ให้ผู้ป่วยแสดง allergy card ของตัวเองกับ **รพ. อื่น** ได้ โดย **ผู้ป่วยเป็นเจ้าของการยินยอม (consent)** ผ่านแอปหมอพร้อม

### 8.1 Consent Flow (รพ.ปลายทางแสดง QR → ผู้ป่วยสแกน)

```
รพ.ปลายทาง (HIS)        Allergy API              หมอพร้อม (ผู้ป่วย)
   │ ขอดูประวัติแพ้ยาคนไข้                            │
   │ ── POST /consent-requests ──►│ สร้าง consent_request
   │ ◄── {requestId, QR} ─────────│  (อายุสั้น ~5 นาที)
   │ แสดง QR บนจอ                  │                    │
   │                              │  สแกน QR ◄──────────│
   │                              │◄ POST /consent/scan │ (auth ด้วย Provider ID/Citizen ของผู้ป่วย)
   │                              │  แสดงว่าใคร(รพ.)ขอ + ขอบเขต
   │                              │◄ POST /consent/approve (ผู้ป่วยกดยินยอม)
   │                              │  สร้าง allergy_consent (active)
   │ ── poll/callback ───────────►│  requestId = approved
   │ ◄── scoped access token ─────│  (ผูก grantee_hospcode + cid + หมดอายุ)
   │ ── GET /shared/cards (token)►│  ตรวจ consent active → คืน signed card(s)
   │ ◄── signed card + public key │
   │ ตรวจลายเซ็นด้วย public key เอง │
```

หัวใจความปลอดภัย: **รพ.ปลายทางไม่เห็นข้อมูลผู้ป่วยจนกว่าผู้ป่วยจะกดยินยอม**; ทุก access ผูกกับ consent ที่ active, scope จำกัด (`read_card`), หมดอายุได้, และถูกบันทึก audit.

### 8.2 Patient Actions บนหมอพร้อม (สิ่งที่ผู้ป่วยทำกับข้อมูลตัวเองได้)

| Action | Endpoint | รายละเอียด |
|--------|----------|-----------|
| ดู allergy card + QR | `GET /api/v1/me/cards` | ดูบัตรแพ้ยาของตัวเอง + QR (auth ด้วยตัวตนผู้ป่วยจากหมอพร้อม) |
| สแกน QR เพื่อ consent | `POST /api/v1/consent/scan` + `/approve` | ดูว่า รพ.ใดขอ + ขอบเขต แล้วกดยินยอม/ปฏิเสธ |
| ดูประวัติการแชร์ | `GET /api/v1/me/consents` | รายการ รพ. ที่เคยให้ consent + สถานะ + วันหมดอายุ |
| ถอน consent (revoke) | `DELETE /api/v1/me/consents/:id` | ถอนสิทธิ์ รพ.ปลายทางได้ทุกเมื่อ → access token นั้นใช้ไม่ได้ทันที |

> ขอบเขต Phase 1: ผู้ป่วย**ดู / consent / จัดการ-ถอน consent** ได้ — **ยังไม่เปิดให้ผู้ป่วยแจ้งแพ้ยาเอง** (กันข้อมูลที่ไม่ผ่านการ verify ปนเข้าระบบ). เปิดภายหลังเป็น self-report แบบ pending รอเภสัช verify ได้ (ดู Open Questions).

### 8.3 ตัวตนผู้ป่วยบนหมอพร้อม

ผู้ป่วย authenticate ผ่านหมอพร้อม (ซึ่งผูกกับ Citizen ID / Health ID ของ MOPH) → API จับคู่ `cid` เพื่อหา card ของผู้ป่วย. ทุก endpoint `/me/*` scope เฉพาะ `cid` ของ token เท่านั้น (เจ้าของข้อมูลเห็นของตัวเองเท่านั้น).

---

## 9. API Surface (สรุป)

```
Auth & Enrollment
  GET  /auth/login                 → redirect MOPH OIDC
  GET  /auth/callback              → exchange code + GET api/info + enroll keypair → session JWT
  POST /auth/logout

Patients (ต้อง auth, tenant=hospcode)
  GET  /api/v1/patients            → list (filter/paging)
  GET  /api/v1/patients/:id        → detail + suspect drugs

Verification (role: doctor|pharmacist; sign ด้วย private key ผ่าน KMS)
  POST /api/v1/patients/:id/verify   → sign decision + card → issue signed card
  POST /api/v1/patients/:id/reject
  PATCH/api/v1/patients/:id/note
  POST /api/v1/patients/:id/card/preview

Cards
  GET  /api/v1/cards/:id           → metadata
  GET  /api/v1/cards/:id/pdf       → ดาวน์โหลด PDF
  GET  /api/v1/cards/:id/verify    → ตรวจลายเซ็นด้วย public key (เปิด, ไม่ต้อง login)
  GET  /embed/card/:render_token   → HTML สำหรับ iframe (signed token)

Keys (public — สำหรับตรวจลายเซ็น)
  GET  /api/v1/keys/:providerId    → public key (PEM/JWK)

Outbound / Consent
  POST   /api/v1/consent-requests        → รพ.ปลายทางสร้างคำขอ + QR
  POST   /api/v1/consent/scan            → ผู้ป่วยสแกน QR (หมอพร้อม)
  POST   /api/v1/consent/approve         → ผู้ป่วยกดยินยอม → ออก scoped token ให้ รพ.
  GET    /api/v1/shared/cards            → รพ.ปลายทางดึง signed card (ด้วย scoped token)

Patient self-service (auth = หมอพร้อม / citizen)
  GET    /api/v1/me/cards                → card ของตัวเอง + QR
  GET    /api/v1/me/consents             → ประวัติการแชร์
  DELETE /api/v1/me/consents/:id         → ถอน consent

Ops
  GET  /healthz  /readyz           → health check
  (internal) ETL loader เขียน patient_drugallergy + etl_run_log
```

API versioned (`/api/v1`) — รองรับ HIS vendors หลายรายในอนาคตโดยไม่ break.

---

## 10. Scalability & Deployment (Node + TS + Express บน Linux)

**App layer**
- Express stateless → รันหลาย instance ด้วย **PM2 cluster** หรือ container, หลัง **Nginx** reverse proxy / load balancer
- Config ผ่าน env (`.env` + secret manager) — ไม่ hardcode
- Logging แบบ structured (pino) + request id; audit log แยกไปตารางของมันเอง

**Data layer**
- PostgreSQL partition ตาม `hospcode` (หรือ `zone_code` สำหรับสเกลประเทศ ~13 เขต / พันกว่า รพ.)
- Connection pool (pgBouncer) — กัน connection exhaustion ตอน traffic สูง
- Read replica สำหรับ list/อ่านหนัก, primary สำหรับ write (verify/stamp)
- ปริมาณตั้งต้น 20,000–30,000 ราย (init.md ข้อ 5) → เล็กสำหรับ Postgres; ออกแบบเผื่อโตระดับประเทศหลายล้าน record

**Roll-out (init.md ข้อ 5)**
- เริ่มนำร่อง **เขต 9** (บุรีรัมย์, โคราช, คูเมือง) → จำกัด tenant ด้วย allowlist hospcode ก่อน → ขยายระดับประเทศเมื่อเสถียร

**Security & Compliance (ข้อมูลสุขภาพ + PDPA)**
- TLS ทุก hop, ข้อมูล PII (CID/HN) เข้ารหัส at rest, mask ใน response ที่ไม่จำเป็น
- Audit trail ครบทุก action (ใคร/เมื่อ/ทำอะไร)
- Rate limiting + WAF ที่ Nginx
- **IP/Logic ที่เป็นความลับ** (init.md ข้อ 5): logic การ retro-search ข้าม รพ. 1 เดือน → แยก repo/โมดูล, จำกัดสิทธิ์เข้าถึง source, ไม่ใส่ใน client
- **Key management**: KMS access policy เข้มงวด (เฉพาะ service role sign ได้), key rotation, แยก audit ของการ sign; consent ทุกครั้งมี expiry + revoke ได้ทันที (PDPA — เจ้าของข้อมูลควบคุม)

**CI/CD**
- TypeScript strict, ESLint, unit + integration test (เทียบ logic กับ notebook), migration ด้วย Prisma/Knex, deploy ผ่าน systemd/PM2 + zero-downtime reload

---

## 11. Future Vision — National Drug-Blocking API (init.md ข้อ 4)

ออกแบบเผื่อ Phase ถัดไป (ยังไม่ implement):

- เปิด endpoint ให้ HIS 30+ vendors เรียกตอนสั่งจ่ายยา:
  `POST /api/national/v1/check-prescription { cid, drug_tmt24[] }`
- เช็คกับ **บัญชียาห้ามจ่าย** ของผู้ป่วย (จาก `allergy_card` ที่ verified + cross-reaction)
- ถ้าตรง → ตอบ `block: true` + เหตุผล → HIS **ล็อกไม่ให้สั่งจ่าย 100%**
- ต้องมี: latency ต่ำ (cache/edge), uptime สูง, ABAC สำหรับ vendor, อาจ federate กับ Smart ID infra เดิม
- ตรงนี้คือเป้าหมายปลายทาง "ล็อกยาที่แพ้ตลอดชีวิต ทุก รพ. ทั้งประเทศ"

---

## 12. Open Questions (รอยืนยันก่อน implement)

1. **Retro window**: notebook ปัจจุบันดึงยา *ทั้งหมด* ก่อน admit; init.md ระบุ **1 เดือน**. ใช้ 30 วันใช่ไหม หรือเก็บทั้งหมดแต่ flag ช่วง 30 วัน?
2. **MOPH Provider ID claims + api/info**: ชื่อ field จริงของ hospcode 5 หลัก / ตำแหน่ง-วิชาชีพ / สถานะ active ใน `api/info` คืออะไร? มี sandbox/เอกสารให้ทดสอบไหม?
3. **HN / person mapping**: ดึง HN จาก `person` ตอน ETL เลย หรือให้เภสัชค้นเองในระบบ?
4. **บัตร design**: มี template/ตราโรงพยาบาลที่ต้องใช้แบบ official ไหม? ภาษาบนบัตร (ไทย/อังกฤษ)?
5. **Object storage**: เก็บ PDF ที่ไหน (local disk / MinIO / cloud)?
6. **ETL ภาษา**: ทำ loader เป็น Python (ใกล้ notebook) หรือพอร์ตเป็น Node ทั้งหมด?
7. **KMS provider**: ใช้ตัวไหน (AWS KMS / HashiCorp Vault Transit / PKCS#11 HSM on-prem)? มีข้อกำหนดต้อง on-prem ในประเทศไหม?
8. **Signature algorithm**: Ed25519 หรือ ECDSA P-256? (ขึ้นกับ KMS ที่เลือกรองรับ)
9. **ตัวตนผู้ป่วยบนหมอพร้อม**: หมอพร้อมมี API/OIDC ให้ระบบเรายืนยัน citizen + ดึง consent ได้แบบไหน? integrate ผ่าน MOPH Health ID หรือ?
10. **Self-report แพ้ยา**: Phase 1 ปิดไว้ — ต้องการเปิดให้ผู้ป่วยแจ้งแพ้ยาเอง (pending รอ verify) ใน phase ถัดไปไหม?

---

*Draft v0.2 — ปรับแก้ตามคำตอบของ Open Questions ก่อนเริ่ม implement*
