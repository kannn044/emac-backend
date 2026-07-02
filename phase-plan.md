# Phase Plan & Test Plan — Drug Allergy Card API

> แผนการพัฒนาแบบแบ่ง Phase + กลยุทธ์การทดสอบราย Phase + หลักการออกแบบโค้ดแบบ dynamic/scalable
> Stack: **Node.js + TypeScript + Express + PostgreSQL** (ตาม `workflow.md`)
> External deps (MOPH Provider ID, KMS/HSM, หมอพร้อม, HIS): **stub/mock หลัง adapter** ในช่วงพัฒนา — สลับเป็นของจริงได้โดยไม่แก้ business logic
> อ้างอิง: `init.md`, `workflow.md`, notebooks `sjs-ten*.ipynb`
> สถานะ: Draft v1 — ใช้ตกลงขอบเขตก่อนลงมือ implement

---

## 0. สรุปหลักการ (TL;DR)

แบ่งงานเป็น **8 Phase** (P0–P7) แบบ incremental: แต่ละ Phase ส่งมอบของที่ทดสอบได้จริง ต่อยอด Phase ก่อนหน้า และมี **Definition of Done (DoD)** + **test case** ชัดเจน Phase ก่อนเป็น dependency ของ Phase ถัดไป

```
P0 Foundation ─► P1 ETL ─► P2 Auth/Identity ─► P3 Patient List ─► P4 Verification
                                                                       │
                                          P5 E-Card ◄──────────────────┘
                                              │
                                              ▼
                                          P6 Consent/Outbound ─► P7 National API (future)
```

หัวใจของ "dynamic / รองรับ scale + เพิ่ม feature": **layered architecture + ports & adapters (hexagonal)** — business logic ไม่ผูกกับ framework/DB/external service ใด ๆ ทุกสิ่งภายนอกเข้าผ่าน interface สลับ implementation (mock ↔ จริง) ได้ด้วยการแก้ config ที่เดียว

---

## 1. หลักการออกแบบโค้ด (Dynamic / Scalable Architecture)

### 1.1 Layered + Ports & Adapters

```
HTTP (Express routes/controllers)   ← เปลี่ยน framework ได้โดยไม่แตะ logic
        │  (DTO in/out, validation ที่ขอบ)
        ▼
Application / Service layer          ← business logic ล้วน (testable เป็น unit)
        │  (เรียก "port" interface เท่านั้น ไม่รู้จัก pg / axios / KMS)
        ▼
Ports (interfaces)                   ← สัญญา: Repository, AuthProvider, KeyService,
        │                               HisConnector, ConsentProvider, PdfRenderer,
        ▼                               Clock, IdGenerator, EventBus
Adapters (implementations)           ← Postgres repo / MOPH OIDC / KMS / Puppeteer / mock
```

กฎ: **ทิศพึ่งพาเข้าหา domain เสมอ** (adapter รู้จัก domain, domain ไม่รู้จัก adapter) ทำให้สลับ Postgres↔in-memory, MOPH-จริง↔mock, KMS↔local-key ได้โดย service ไม่เปลี่ยนเลย

### 1.2 โครงสร้างโฟลเดอร์ (แบ่งตาม domain module — เพิ่ม feature = เพิ่มโฟลเดอร์)

```
src/
  config/            # โหลด env, validate ด้วย zod, export typed config
  core/              # ของกลาง: errors, Result type, logger, di-container, base types
  ports/             # interface ทั้งหมด (สัญญา) — ไม่มี implementation
  adapters/
    db/              # PostgresXxxRepository (implements ports/*Repository)
    auth/            # MophAuthProvider + MockAuthProvider
    keys/            # KmsKeyService + LocalKeyService(dev)
    his/             # MockHisConnector (Phase 1) + interface เผื่อ vendor จริง
    consent/         # MorPromConsentProvider + MockConsentProvider
    pdf/             # PuppeteerPdfRenderer
  modules/           # feature modules (1 โฟลเดอร์ = 1 bounded context)
    etl/             # loader + classifier + tmt mapping
    patients/        # list/detail service + controller
    verification/    # verify/reject/note/preview + signing + state machine
    cards/           # card generation + render + public verify
    consent/         # outbound consent + shared cards + patient self-service
  http/              # express app, router (mount /api/v1), middleware, error handler
  db/                # migrations, seeds
  index.ts           # composition root: ประกอบ adapter เข้า service ตาม config
test/
  unit/  integration/  e2e/  fixtures/  helpers/
```

### 1.3 เทคนิคที่ทำให้ "dynamic"

| เป้าหมาย | วิธี |
|----------|------|
| สลับ implementation (mock↔จริง) | **DI container / composition root** เดียว (`index.ts`) เลือก adapter ตาม `config.env`; ที่อื่นรับผ่าน constructor injection |
| เพิ่ม external system ใหม่ | เพิ่ม **port interface** + adapter ใหม่ — service เดิมไม่แก้ |
| เพิ่ม endpoint/โดเมนใหม่ | เพิ่ม **module** ใหม่ใน `modules/` + mount router — ไม่กระทบของเดิม |
| รองรับ HIS 30+ vendors | `HisConnector` เป็น interface; ลงทะเบียน adapter ราย vendor ใน **registry** (strategy pattern) |
| validation สม่ำเสมอ | **zod schema** ที่ขอบ HTTP ทุก endpoint → reject input ผิดก่อนถึง logic |
| tenant isolation (กันข้อมูลข้าม รพ.) | บังคับ `WHERE hospcode = ctx.hospcode` ที่ **repository layer** ไม่ใช่ caller |
| เปลี่ยน config โดยไม่แก้โค้ด | ทุกค่า (DB, OIDC url, KMS, retro window, allowlist hospcode) มาจาก **typed env config** |
| API ไม่ break ตอนเพิ่มของ | versioned `/api/v1`; เพิ่มของใหม่เป็น additive |
| สเกลแนวนอน | service **stateless**; state อยู่ใน Postgres/Redis เท่านั้น |
| observability | structured log (pino) + request-id + audit log แยกตาราง |

### 1.4 Cross-cutting (ใช้ทุก Phase)
- **Error model กลาง**: `AppError` มี `code`, `httpStatus`, `details` → error-handler แปลงเป็น JSON มาตรฐาน `{error:{code,message,details}}`
- **Result/transaction**: write ที่มีหลายขั้น (verify→card→audit) ทำใน transaction เดียว rollback ทั้งหมดถ้าพลาด
- **Clock & IdGenerator** เป็น port → test กำหนดเวลา/UUID ได้ (deterministic)
- **EventBus** (in-process Phase แรก) → ปล่อย domain event (`CardIssued`, `ConsentRevoked`) เผื่อต่อ async/national API ภายหลังโดยไม่แก้ caller

---

## 2. Phase Breakdown (สัดส่วน / ขอบเขตแต่ละ Phase)

แต่ละ Phase ระบุ: เป้าหมาย, deliverable, จุด dynamic, DoD, น้ำหนักโดยประมาณ

### P0 — Project Foundation & Test Harness  *(สัดส่วน ~10%)*
**เป้าหมาย:** วางโครงให้ทุก Phase ถัดไปเขียนง่าย + ทดสอบได้ตั้งแต่บรรทัดแรก
- TypeScript strict, ESLint/Prettier, โครงโฟลเดอร์ §1.2
- Express app + health endpoints (`/healthz`, `/readyz`) + error handler + request-id + pino
- **Typed config** (zod) อ่าน env; แยก profile `dev/test/prod`
- **DI composition root** + ประกาศ **ports ทั้งหมด** (interface เปล่า ๆ ก่อน)
- DB: Postgres connection pool + **migration tool** (เลือก Knex หรือ node-pg-migrate) + Dockerized Postgres สำหรับ test
- **Test harness**: Jest/Vitest + supertest; in-memory adapter ฐาน; CI workflow (lint+test)
- **DoD:** `npm test` รันผ่าน (มี smoke test ของ health endpoint), CI เขียว, สลับ adapter mock ได้

### P1 — ETL Loader → `patient_drugallergy`  *(~12%)*
**เป้าหมาย:** แปลง logic จาก notebook เป็น batch job idempotent (`workflow.md §2`)
- พอร์ต logic: admit (diag `L51%` → L511/512/519) → retro cross-hospital drug search (via CID) → classify (NSAID/ABX/Allo/CBZ) → map TMT24
- `natural_key = hash(hospcode|pid|datetime_admit|diagcode)` → **UPSERT**: insert ใหม่ = `pending`; แก้ของเดิมที่ยังไม่ verify; **ห้ามแตะ row ที่ verified**
- เขียน `etl_run_log` (insert/update/skip/error) + advisory lock กัน cron ซ้อน
- รองรับ **retro window 30 วัน** เป็น config (`RETRO_WINDOW_DAYS`, ดู Open Q1)
- จุด dynamic: source อ่านผ่าน `StagingSource` port (DuckDB จริง ↔ fixture CSV ตอน test); classifier เป็น rule list ขยายได้
- **DoD:** รัน loader กับ fixture → ได้ row ตามคาด; รันซ้ำ = ไม่เกิด duplicate, ไม่ทับ verified

### P2 — Auth, Identity & Key Enrollment  *(~15%)*
**เป้าหมาย:** ทุก request ปลอดภัย + รู้ตัวตน + มี keypair (`workflow.md §4`)
- `AuthProvider` port: `exchangeCode / verify(JWT via JWKS) / getInfo(api/info)` → **MockAuthProvider** (Phase นี้) + โครง `MophAuthProvider`
- กฎ: เป็นบุคลากรการแพทย์จริง + hospcode 5 หลักอยู่ใน master รพ. → ออก session JWT `{providerId,hospcode,role,name,keyId}`
- `KeyService` port: `ensureEnrolled/sign/getPublicKey` → **LocalKeyService** (dev, Ed25519) + โครง `KmsKeyService`; เก็บ public key ใน `provider_signing_key`
- **Middleware**: ตรวจ session JWT → ใส่ `req.ctx`; **บังคับ tenant scope ที่ repo**; **RBAC** (doctor/pharmacist); ตรวจ enrollment
- จุด dynamic: เปลี่ยน provider/field names = แก้แค่ adapter; เปลี่ยน KMS = แก้แค่ KeyService
- **DoD:** login mock ออก JWT; เรียก protected endpoint ไม่มี token = 401; ข้าม hospcode = 403; key ถูก enroll ครั้งแรกครั้งเดียว

### P3 — Patient Listing (Tenant-scoped) + Audit  *(~10%)*
**เป้าหมาย:** list/detail ผู้ป่วยเฉพาะ รพ. ตน (`workflow.md §5`)
- `GET /api/v1/patients` (filter: status/ช่วง admit/diagcode/กลุ่มยา/ค้น HN-PID + paging) — กรอง hospcode จาก token เสมอ (ห้ามรับจาก query)
- `GET /api/v1/patients/:id` รายละเอียดเต็ม + suspect_drugs + source hospcode + cross-reaction
- เขียน `verification_audit_log` action `VIEW`
- จุด dynamic: filter เป็น **query-builder spec** (เพิ่ม filter ใหม่ = เพิ่ม spec); paging มาตรฐาน reuse ทุก list
- **DoD:** list คืนเฉพาะ row ของ hospcode ตน; paging/filter ถูกต้อง; เปิด detail = มี audit log

### P4 — Verification Flow + Signing  *(~18%)*
**เป้าหมาย:** หัวใจระบบ — verify/reject/note/preview + ลายเซ็นดิจิทัล (`workflow.md §6`)
- `POST /verify` (เลือก confirmed_drugs[] + cross_reaction + note) → สร้าง canonical payload → `KeyService.sign` → insert `allergy_verification` + set `verified` + (เตรียม) ออก card → audit — **ใน transaction เดียว**
- `POST /reject` → snapshot ไป `rejected_records`, set `rejected`
- `PATCH /note`, `POST /card/preview` (render ไม่บันทึก)
- **State machine** `pending→verified|rejected`; verified = read-only
- **Cross-reaction**: ตาราง `drug_cross_reaction` (seed) → เสนอกลุ่มที่ต้อง block
- จุด dynamic: canonical-payload + signing เป็น service กลาง reuse ทั้ง verify/card; cross-reaction เป็น data-driven (เพิ่มกลุ่ม = เพิ่มแถว seed)
- **DoD:** verify แล้ว status=verified + มี signature ตรวจผ่าน public key; reject แล้วข้อมูลไป rejected_records ไม่ปนของจริง; transaction fail = rollback ครบ

### P5 — E-Allergy Card Generation  *(~13%)*
**เป้าหมาย:** ออกบัตรลงนาม + render + ตรวจความแท้ (`workflow.md §7`)
- ออก `allergy_card` (immutable) จาก template เดียว → preview/issue/PDF หน้าตาตรงกัน
- `GET /embed/card/:render_token` (iframe, signed token หมดอายุได้, CSP frame-ancestors allowlist)
- `GET /cards/:id/pdf` (Puppeteer → object storage; `PdfRenderer` + `ObjectStorage` ports → local disk dev)
- `GET /cards/:id/verify` (public, ตรวจ `card_signature` ด้วย public key) + `GET /keys/:providerId`
- ออกหลายใบได้ถ้าแพ้หลายตัวแยกกัน
- จุด dynamic: template เป็น data-driven (เพิ่ม field/ภาษา = แก้ template+payload); storage/render เป็น port (สลับ local↔MinIO↔cloud)
- **DoD:** issue → ได้ card + PDF + QR; ตรวจ verify endpoint = valid; แก้ payload 1 byte → verify = invalid

### P6 — Outbound Consent & Patient Self-service  *(~12%)*
**เป้าหมาย:** แชร์ข้ามโรงพยาบาลโดยผู้ป่วยยินยอม (`workflow.md §8`)
- `POST /consent-requests` (รพ.ปลายทางสร้าง QR อายุสั้น) → `consent/scan` → `consent/approve` → ออก **scoped token** (ผูก grantee_hospcode+cid+expiry)
- `GET /shared/cards` (รพ.ปลายทางดึง signed card ด้วย scoped token; ตรวจ consent active)
- Patient self-service: `GET /me/cards`, `GET /me/consents`, `DELETE /me/consents/:id` (revoke = token ใช้ไม่ได้ทันที)
- `ConsentProvider` port → **MockConsentProvider** (หมอพร้อม) + โครงจริง
- จุด dynamic: identity ผู้ป่วยผ่าน port (citizen/health id); scope/expiry เป็น policy ปรับได้
- **DoD:** ก่อน approve รพ.ปลายทางเห็น 0 ข้อมูล; หลัง approve ดึง card ได้; revoke แล้วเข้าถึงไม่ได้ทันที; ทุก access มี audit

### P7 — National Drug-Blocking API  *(Future, ออกแบบเผื่อ — ไม่ implement รอบนี้)*
**เป้าหมาย:** `workflow.md §11` — `POST /api/national/v1/check-prescription {cid, drug_tmt24[]}` → เช็คบัญชียาห้ามจ่าย → `block:true` ล็อก 100%
- ออกแบบไว้: low-latency cache, ABAC ราย vendor, federate Smart ID
- จุด dynamic: ใช้ `EventBus` (`CardIssued`) อัปเดต denylist cache; vendor auth เป็น strategy
- **DoD (เมื่อทำ):** เช็คยาที่แพ้/cross-reaction → block; latency เป้าหมาย < Xms; vendor ที่ไม่ได้สิทธิ์ = 403

---

## 3. Test Plan (กลยุทธ์ + Test Case ราย Phase)

### 3.1 Test Pyramid & เครื่องมือ
- **Unit** (เยอะสุด, เร็ว): service/domain logic ล้วน ใช้ mock ports — ไม่มี IO
- **Integration** (กลาง): adapter จริงกับ Postgres (Dockerized / Testcontainers), repository, transaction
- **E2E / API** (น้อยแต่ครอบ flow): supertest ยิง HTTP จริงผ่าน app ที่ประกอบด้วย mock external (auth/KMS/consent) + Postgres test
- เครื่องมือ: **Vitest หรือ Jest** + **supertest** + **Testcontainers/pg** + **nock** (mock HTTP ของ MOPH/หมอพร้อมตอนต่อจริง) + coverage gate (เช่น ≥80% ที่ service layer)
- ข้อมูล: `test/fixtures/` (admit/drug rows, provider info, cross-reaction seed); reset DB ต่อ test ด้วย transaction rollback หรือ truncate

### 3.2 Test Case ราย Phase

แต่ละแถว = test case ที่ตรวจสอบได้ (ID ใช้อ้างใน PR/CI)

**P0 — Foundation**

| ID | ประเภท | สถานการณ์ | คาดหวัง |
|----|--------|-----------|---------|
| P0-1 | e2e | `GET /healthz` | 200 `{status:"ok"}` |
| P0-2 | e2e | `GET /readyz` ตอน DB ใช้ได้ | 200; ตอน DB ล่ม → 503 |
| P0-3 | unit | config โหลด env ขาด field บังคับ | throw ตอน boot (fail fast) |
| P0-4 | unit | DI ประกอบด้วย profile=test | คืน mock adapter ทั้งหมด |
| P0-5 | e2e | route ไม่รู้จัก | 404 รูปแบบ error มาตรฐาน |
| P0-6 | unit | error handler รับ `AppError` | map เป็น JSON `{error:{code,...}}` + http status ถูก |

**P1 — ETL**

| ID | ประเภท | สถานการณ์ | คาดหวัง |
|----|--------|-----------|---------|
| P1-1 | unit | diagcode `L512`,`L51` | normalize เป็น L511/512/519 ถูกต้อง; ไม่ใช่ L51 → ข้าม |
| P1-2 | unit | retro search drug ก่อน admit < 30 วัน vs > 30 วัน | เก็บเฉพาะ ≤30 วัน (ตาม window config) |
| P1-3 | unit | CID เดียวมีหลาย (hospcode,pid) | ดึงยาข้าม รพ. ครบทุกคู่ |
| P1-4 | unit | classifier ยา NSAID/ABX/Allopurinol/CBZ | จัดกลุ่มถูกตาม regex; ยาไม่เข้ากลุ่ม → other/ว่าง |
| P1-5 | integration | รัน loader กับ fixture ครั้งแรก | insert row สถานะ `pending` + `etl_run_log` |
| P1-6 | integration | รัน loader **ซ้ำ** (idempotent) | natural_key เดิม → ไม่ duplicate; counter skip เพิ่ม |
| P1-7 | integration | row เดิมถูก verified แล้ว แล้ว source เปลี่ยน | **ไม่ทับ**; log ว่า source เปลี่ยนเพื่อ review |
| P1-8 | integration | cron ซ้อนรอบ (รัน 2 ตัวพร้อมกัน) | advisory lock กัน → ตัวที่สองข้าม |
| P1-9 | unit | TMT24 mapping ยาที่ map ไม่ได้ | เก็บ didstd + flag unmapped (ไม่ทำ job ล้ม) |

**P2 — Auth / Identity / Keys**

| ID | ประเภท | สถานการณ์ | คาดหวัง |
|----|--------|-----------|---------|
| P2-1 | unit | verify JWT หมดอายุ / signature ผิด | reject |
| P2-2 | unit | api/info: ไม่ใช่บุคลากรการแพทย์ | ไม่ enroll, ไม่ออก session |
| P2-3 | unit | hospcode 5 หลักไม่อยู่ใน master | ปฏิเสธ |
| P2-4 | integration | login ครั้งแรกสำเร็จ | enroll keypair 1 คู่ + บันทึก public key |
| P2-5 | integration | login ครั้งที่สอง (provider เดิม) | ไม่ enroll ซ้ำ; โหลด key เดิม |
| P2-6 | e2e | เรียก protected endpoint ไม่มี token | 401 |
| P2-7 | e2e | role ไม่ใช่ doctor/pharmacist เรียก verify | 403 |
| P2-8 | integration | repo query ของ user รพ. A | คืนเฉพาะ hospcode A (กัน leak ข้าม รพ.) |
| P2-9 | unit | sign แล้ว verify ด้วย public key | ตรงกัน; ของปลอม → ไม่ผ่าน |

**P3 — Patient List**

| ID | ประเภท | สถานการณ์ | คาดหวัง |
|----|--------|-----------|---------|
| P3-1 | e2e | list โดย user รพ. A | เห็นเฉพาะผู้ป่วย รพ. A |
| P3-2 | e2e | ส่ง `hospcode` ปลอมใน query | ถูกเพิกเฉย ใช้จาก token เท่านั้น |
| P3-3 | integration | filter `status=pending` + paging | คืนหน้า/จำนวนถูก + total |
| P3-4 | integration | filter ช่วงวัน admit + diagcode | ตรงเงื่อนไข |
| P3-5 | e2e | เปิด detail `:id` | คืน suspect_drugs ครบ + เขียน audit `VIEW` |
| P3-6 | e2e | เปิด detail ของ รพ. อื่น | 404/403 (ไม่หลุดข้าม รพ.) |

**P4 — Verification**

| ID | ประเภท | สถานการณ์ | คาดหวัง |
|----|--------|-----------|---------|
| P4-1 | e2e | verify เลือก 2 จาก 5 ยา + note | status=verified; confirmed_drugs = subset ที่เลือก |
| P4-2 | integration | verify สร้าง signature | `decision_signature` ตรวจผ่าน public key |
| P4-3 | integration | verify = 1 transaction; จงใจให้ insert card fail | rollback ทั้งหมด (ไม่มี verification ค้าง) |
| P4-4 | e2e | verify record ที่ verified แล้วซ้ำ | 409 (read-only) |
| P4-5 | e2e | reject พร้อม reason | snapshot ไป `rejected_records`; ไม่อยู่ใน list จริง |
| P4-6 | unit | cross-reaction ของยา Allopurinol | คืนกลุ่ม related ตาม seed |
| P4-7 | e2e | PATCH note ก่อน stamp | อัปเดต note ได้; หลัง stamp → ปฏิเสธ |
| P4-8 | e2e | preview card | คืน HTML/URL โดยไม่บันทึก allergy_card |
| P4-9 | integration | ทุก action เขียน audit | มี log STAMP/REJECT/EDIT พร้อม providerId |

**P5 — E-Card**

| ID | ประเภท | สถานการณ์ | คาดหวัง |
|----|--------|-----------|---------|
| P5-1 | integration | issue card หลัง verify | สร้าง allergy_card immutable + render_token |
| P5-2 | e2e | `GET /cards/:id/verify` บัตรแท้ | `valid:true` + issuer/hospcode |
| P5-3 | unit | แก้ card_payload 1 byte แล้ว verify | `valid:false` |
| P5-4 | e2e | `GET /embed/card/:token` token หมดอายุ | ปฏิเสธ |
| P5-5 | e2e | embed จาก origin นอก allowlist | บล็อกด้วย CSP/X-Frame-Options |
| P5-6 | integration | gen PDF | ได้ไฟล์ใน object storage (local) + pdf_path |
| P5-7 | e2e | แพ้ 2 ยาแยกกัน | ออก 2 card ได้ |
| P5-8 | e2e | `GET /keys/:providerId` | คืน public key ใช้ตรวจได้ |

**P6 — Consent / Outbound**

| ID | ประเภท | สถานการณ์ | คาดหวัง |
|----|--------|-----------|---------|
| P6-1 | e2e | สร้าง consent-request | คืน requestId + QR; สถานะ pending |
| P6-2 | e2e | รพ.ปลายทางดึง card ก่อน approve | 403 (เห็น 0 ข้อมูล) |
| P6-3 | e2e | ผู้ป่วย scan+approve | ออก scoped token ผูก hospcode+cid |
| P6-4 | e2e | ดึง `/shared/cards` ด้วย scoped token | คืน signed card + public key |
| P6-5 | e2e | scoped token ของ รพ. A ใช้ดึง cid อื่น | 403 (scope จำกัด) |
| P6-6 | e2e | consent หมดอายุ | เข้าถึงไม่ได้ |
| P6-7 | e2e | `DELETE /me/consents/:id` (revoke) | token เดิมใช้ไม่ได้ทันที |
| P6-8 | e2e | `/me/cards` ของผู้ป่วย | เห็นเฉพาะ cid ตน |
| P6-9 | integration | ทุก access ขาออก | มี audit (ใคร/เมื่อ/อะไร) |

**P7 — National API (เขียน test ตอน implement)**

| ID | ประเภท | สถานการณ์ | คาดหวัง |
|----|--------|-----------|---------|
| P7-1 | e2e | check ยาที่ผู้ป่วยแพ้ | `block:true` + reason |
| P7-2 | e2e | check ยาในกลุ่ม cross-reaction | `block:true` |
| P7-3 | e2e | check ยาปลอดภัย | `block:false` |
| P7-4 | e2e | vendor ไม่ได้รับสิทธิ์ | 403 (ABAC) |
| P7-5 | perf | load test | latency/throughput ตามเป้า |

### 3.3 Regression & Pipeline-parity
- **Parity test**: เทียบผล P1 classifier/retro-search กับผลจาก notebook (`sjs-ten*.ipynb`) บนชุดข้อมูลตัวอย่างเดียวกัน → กัน logic เพี้ยนตอนพอร์ตจาก pandas → production
- ทุก Phase ที่ปิดแล้ว test ต้องเขียวต่อใน CI ก่อน merge (no regression)

---

## 4. Definition of Done (ใช้ทุก Phase)
1. โค้ดผ่าน TypeScript strict + ESLint, ไม่มี `any` ที่หลีกเลี่ยงได้
2. Test case ของ Phase ผ่านครบ + coverage service layer ≥ เกณฑ์
3. External system ใหม่เข้าผ่าน **port** + มี mock adapter
4. Migration + seed รันได้ทั้งขึ้น/ลง (reversible)
5. Audit log ครบทุก action ที่เปลี่ยน state
6. เอกสาร endpoint (OpenAPI/README) อัปเดต
7. CI เขียว (lint + unit + integration + e2e)

---

## 5. ลำดับ & Dependency
```
P0 ─► P1 ─► P2 ─► P3 ─► P4 ─► P5 ─► P6 ─► (P7 future)
        └────────────┐
P0 จำเป็นต่อทุก Phase; P4 ต้องมี P2(sign)+P3(list); P5 ต้องมี P4; P6 ต้องมี P5
```
ทำตามลำดับ; P1 กับ P2 พัฒนาคู่ขนานได้บางส่วน (คนละ module) เพราะแยก port ชัด

---

## 6. Open Questions ที่ block การ implement (ดึงจาก `workflow.md §12`)
ต้องเคลียร์ก่อน/ระหว่างทำ Phase ที่เกี่ยวข้อง:
1. **Retro window** (P1): 30 วันแน่นอน หรือเก็บทั้งหมดแต่ flag 30 วัน?
2. **MOPH api/info field names + sandbox** (P2)
3. **HN/person mapping**: ดึงตอน ETL หรือให้เภสัชค้น? (P1/P3)
4. **Card template/ตรา รพ./ภาษา** (P5)
5. **Object storage**: local/MinIO/cloud (P5)
6. **ETL ภาษา**: Python (ใกล้ notebook) หรือ Node (P1)
7. **KMS provider** + ข้อกำหนด on-prem ในประเทศ (P2/P4)
8. **Signature algorithm**: Ed25519 vs ECDSA P-256 (P2)
9. **ตัวตนผู้ป่วยบนหมอพร้อม / Health ID** (P6)
10. **Self-report แพ้ยา** เปิด phase ถัดไปไหม (post-P6)

> หมายเหตุ: ข้อ 6 (ETL Python vs Node) ส่งผลต่อ repo layout ของ P1 — แนะนำทำ ETL เป็น **service แยก** (Python ใกล้ notebook) ที่เขียน Postgres ผ่าน contract เดียวกัน ทำให้ API (Node) ไม่ผูกภาษาของ pipeline

---

*Draft v1 — ใช้ทบทวนและตกลงขอบเขต/ลำดับก่อนลงมือ P0*
