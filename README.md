# Drug Allergy Card API

API ระบบบัตรแพ้ยาอิเล็กทรอนิกส์ระดับประเทศ — Node.js + TypeScript + Express + PostgreSQL

> แผนการพัฒนาแบ่งเป็น Phase: ดู [`phase-plan.md`](./phase-plan.md)
> สถาปัตยกรรม/สเปกเต็ม: ดู [`workflow.md`](./workflow.md) · Knowledge base: [`init.md`](./init.md)

## สถานะ

| Phase | ขอบเขต | สถานะ |
|-------|--------|-------|
| **P0** | Foundation: config, error model, logger, DI, health endpoints, test harness | ✅ เสร็จ (test เขียว) |
| **P1** | ETL ingestion: parquet inbox → aggregate → UPSERT `patient_drugallergy` | ✅ เสร็จ (test เขียว 42/42) |
| **P2** | Auth (MOPH OIDC — **mock**) + key enrollment (Ed25519) + session JWT | ✅ mock (test เขียว) |
| **P3** | Patient listing/detail (tenant-scoped) + audit VIEW | ✅ เสร็จ |
| **P4** | Verification flow + digital signing (Ed25519) + reject/note/preview + public key | ✅ เสร็จ |
| **P5** | E-Allergy Card: issue (immutable) + public verify + embed HTML + QR | ✅ เสร็จ (test เขียว 97/97) |
| P6 | Outbound consent (หมอพร้อม) | ⏳ |
| P7 | National drug-blocking API | 🔮 future |

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env      # แก้ค่าตามเครื่อง
npm run dev               # dev server (tsx watch)
npm test                  # รัน unit + e2e ทั้งหมด
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
```

ต้องมี Node.js ≥ 20 และ PostgreSQL (สำหรับรันจริง; test ใช้ stub ไม่ต้องมี DB)

## โครงสร้าง (ports & adapters)

```
src/
  config/      โหลด+validate env (zod) — fail fast ถ้าผิด
  core/        errors, logger, clock, event-bus, DI container
  ports/       interface ทั้งหมด (สัญญา) — domain เรียกผ่านนี้เท่านั้น
  adapters/    implementation จริง/mock ของ ports (db, auth, keys, his, ...)
  modules/     feature ราย bounded context (etl, patients, verification, cards, consent)
  http/        express app, middleware, routes
  index.ts     composition root
test/          unit / integration / e2e + helpers/fixtures
```

**หลักการ:** business logic ไม่ผูกกับ framework/DB/external service — สลับ mock ↔ ของจริงที่ `buildContainer` ที่เดียว (เลือกตาม env) เพิ่ม feature = เพิ่ม module; เพิ่ม external system = เพิ่ม port + adapter

## การสลับ adapter (mock ↔ จริง)

ช่วงพัฒนา external deps ที่ยังไม่มี sandbox (MOPH Provider ID, KMS, หมอพร้อม, HIS) ใช้ mock — คุมที่ `.env`:

```
AUTH_PROVIDER=mock      # → real เมื่อมี OIDC sandbox
KEY_SERVICE=local       # → kms
CONSENT_PROVIDER=mock
HIS_CONNECTOR=mock
```

## ETL Ingestion (P1)

ETL จริงรันบน server แยก (DuckDB) แล้ว "โยน" ไฟล์ **parquet** มาวางที่ `data/inbox/`
API ตัวนี้ทำหน้าที่ **import** เข้าตาราง `patient_drugallergy` เท่านั้น

```
data/inbox/  ← server ETL วางไฟล์ .parquet ที่นี่ (ไฟล์อยู่กับที่ ไม่ย้าย)
```

**Column contract** (1 แถว = ยา 1 รายการ ของผู้ป่วย 1 admit):

```
HOSPCODE, PID, DIAGCODE, DATETIME_ADMIT, DIDSTD, DNAME, DATE_SERV
```

importer จะ: validate (zod) → normalize diagcode (L511/512/519) → group เป็น patient-level →
classify ยา (NSAID/Antibiotic/Allopurinol/Carbamazepine) → สร้าง `natural_key` →
**UPSERT** (ใหม่=pending, เดิม pending=update, verified/rejected=ห้ามแตะ) → log ที่ `etl_ingest_log`
(กันนำเข้าซ้ำด้วย checksum)

```bash
npm run migrate                 # สร้างตาราง (ต้องมี Postgres + DATABASE_URL)
npm run etl:gen-mock            # สร้าง parquet ตัวอย่างใน data/inbox/
npm run etl:import -- --all     # import ทุกไฟล์ใน inbox (manual / cron)
npm run dev                     # เปิด server → file watcher import อัตโนมัติ
```

> **dynamic:** parquet reader, repos เป็น adapter หลัง port — เปลี่ยนเป็น CSV/JSON หรือ DB อื่นได้
> โดยไม่แตะ logic; เพิ่มยาเข้า classifier = เพิ่มแถวใน `CLASSIFIER_RULES`
> classifier rules เป็น **seed** — ควร align กับ regex จริงใน `sjs-ten-ipd-drug.ipynb`

## Deployment (shared domain)

service ถูก deploy ใต้ path บน domain ที่แชร์หลาย service:

```
https://api-mophlink.moph.go.th/drugallergy
```

ตั้งค่า env ฝั่ง production:

```
HTTP_BASE_PATH=/drugallergy
PUBLIC_BASE_URL=https://api-mophlink.moph.go.th/drugallergy
TRUST_PROXY=true
```

แอป mount ทุก route ใต้ `HTTP_BASE_PATH` และใช้ `PUBLIC_BASE_URL` สร้าง absolute URL
(OIDC redirect, QR ตรวจบัตร, PDF link) — nginx **ไม่ strip prefix** จึงไม่มี path mismatch

nginx config: [`deploy/nginx/api-mophlink.conf`](./deploy/nginx/api-mophlink.conf)
(reverse proxy `/drugallergy/` → upstream, TLS, X-Forwarded-*, security headers, rate limit)

> **OIDC Redirect URL** ที่ลงทะเบียนกับ MOPH Provider ID:
> `https://api-mophlink.moph.go.th/drugallergy/auth/callback`
> (ดูเอกสารกรอกฟอร์มขอเชื่อมต่อ: [`docs/moph-providerid-request.md`](./docs/moph-providerid-request.md))

## Test

- unit: logic ล้วน + mock ports
- e2e: ยิง HTTP จริงผ่าน supertest (app ประกอบด้วย stub adapter, ไม่ต้องมี DB)
- integration (P1+): adapter จริงกับ Postgres (Testcontainers)

Test case ทั้งหมด map กับ ID ใน `phase-plan.md §3.2` (เช่น P0-1, P1-6)
