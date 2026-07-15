# Drug Allergy Card API (eMAC Backend)

API ระบบบัตรแพ้ยาอิเล็กทรอนิกส์ระดับประเทศ — Node.js + TypeScript + Express + PostgreSQL

> แผนการพัฒนาแบ่งเป็น Phase: ดู [`phase-plan.md`](./phase-plan.md)
> สถาปัตยกรรม/สเปกเต็ม: ดู [`workflow.md`](./workflow.md) · Knowledge base: [`init.md`](./init.md)
> **คู่มือการใช้งาน API (สำหรับ user/third party): [`docs/api-manual.docx`](./docs/api-manual.docx)**
> **Insomnia collection: [`docs/insomnia-drugallergy.json`](./docs/insomnia-drugallergy.json)**

## ภาพรวมระบบ

```
                 ┌──────────────────────┐        ┌───────────────────────────────┐
 บุคลากร ────►  │ emac.moph.go.th      │  nginx │ api-mophlink.moph.go.th       │
 (แพทย์/เภสัช)  │ (frontend, static)   │ ─────► │   /drugallergy  (API ตัวนี้)   │
                 └──────────────────────┘  proxy └──────────┬────────────────────┘
                                                            │ OAuth2 broker
 Third-party ──── /auth/login?redirect_to=... ──────────────┤
 (HIS ฯลฯ)                                                  ▼
                                                 MOPH Provider ID (provider.id.th)
```

- ผู้ใช้ยืนยันตัวตนด้วย **MOPH Provider ID (OAuth2 Authorization Code)** — ระบบตรวจว่าเป็น
  แพทย์/เภสัชกรจริงจาก profile API แล้วออก **session JWT** ภายใน (อายุ 15 นาที)
- ทุก query ถูกจำกัดตาม รพ. (`hospcode`) ของผู้ login อัตโนมัติ (tenant isolation)
- การยืนยันแพ้ยาถูก **ลงนามดิจิทัล (Ed25519)** ด้วย key ประจำตัวบุคลากร → ออกบัตรที่
  ใครก็ตรวจความแท้ได้ผ่าน public endpoint

## สถานะ

| Phase | ขอบเขต | สถานะ |
|-------|--------|-------|
| **P0** | Foundation: config, error model, logger, DI, health endpoints, test harness | ✅ |
| **P1** | ETL ingestion: parquet inbox → aggregate → UPSERT `patient_drugallergy` | ✅ |
| **P2** | Auth MOPH Provider ID (**OAuth2 จริง** + mock สำหรับ dev) + key enrollment + session JWT | ✅ |
| **P3** | Patient listing/detail (tenant-scoped) + audit VIEW | ✅ |
| **P4** | Verification flow + digital signing (Ed25519) + reject/note/preview + public key | ✅ |
| **P5** | E-Allergy Card: issue (immutable) + public verify + embed HTML + QR | ✅ |
| **P5.5** | Third-party OAuth broker (`redirect_to` + allowlist) | ✅ |
| P6 | Outbound consent (หมอพร้อม) | ⏳ |
| P7 | National drug-blocking API | 🔮 future |

## เริ่มใช้งาน (dev)

```bash
npm install
cp .env.example .env      # แก้ค่าตามเครื่อง
npm run dev               # dev server (tsx watch) → http://localhost:3000
npm test                  # unit + e2e ทั้งหมด
npm run typecheck         # tsc --noEmit
```

ต้องมี Node.js ≥ 20 · Postgres จำเป็นเมื่อใช้ store จริง (dev ตั้ง `KEY_STORE=memory DATA_STORE=memory` รันได้โดยไม่มี DB)

## Authentication — 3 ช่องทาง

### 1) Web login (emac frontend)

`GET /auth/login` → 302 ไปหน้า login MOPH Provider ID → callback กลับที่
`/auth/callback` → เด้ง `?code` ไป frontend (`MOPH_PROVIDER_FRONTEND_CALLBACK_URL`) →
frontend `POST /auth/callback {code}` → ได้ `{ token, expiresAt, profile }`

### 2) Third-party broker (ระบบภายนอก เช่น HIS)

ระบบภายนอกไม่ต้องมี client id/secret ของ Provider ID — ใช้ API นี้เป็น broker:

```
GET /auth/login?redirect_to=https://his-a.go.th/callback&state=<csrf-ของเขา>
  → user login กับ Provider ID
  → ระบบเด้ง https://his-a.go.th/callback?code=...&state=<csrf-เดิม>
  → backend ของเขา POST /auth/callback {code} → session JWT → เรียก /api/v1/*
```

### Token lifetime & refresh

`POST /auth/callback` (และ mock `/auth/session`) คืน **access token + refresh token**:

- **access token** อายุ **30 นาที** — แนบทุก request (`Authorization: Bearer <token>`)
- **refresh token** ต่ออายุ access ได้จนถึงเพดาน **12 ชม. นับจาก login** — `POST /auth/refresh { refreshToken }` → ได้ access + refresh ชุดใหม่ (`refreshExpiresAt` = เพดานเดิม ไม่ยืด)
- เกิน 12 ชม. → `/auth/refresh` ตอบ 401 → ต้อง login ใหม่ผ่าน Provider ID

```
POST /auth/refresh   { "refreshToken": "<token>" }
→ 201 { token, expiresAt, refreshToken, refreshExpiresAt }
→ 401 = refresh token หมดอายุ (เกิน 12 ชม.) → login ใหม่
```

ปรับอายุได้ที่ env: `SESSION_JWT_TTL_SECONDS` (access, default 1800) · `SESSION_REFRESH_TTL_SECONDS` (refresh/เพดาน, default 43200)

`redirect_to` ต้องอยู่ใน `THIRD_PARTY_REDIRECT_ALLOWLIST` (https เท่านั้น) — ระบบห่อ
redirect target ไว้ใน state แบบ HMAC-signed (หมดอายุ 10 นาที) ปลอมไม่ได้

### 3) Public (ไม่ต้อง login)

ตรวจความแท้บัตร: `GET /api/v1/cards/:id/verify` · แสดงบัตร: `GET /embed/card/:token` ·
public key ผู้ลงนาม: `GET /api/v1/keys/:providerId`

## Drug allergy history query (CID lookup)

`POST /api/v1/drugallergy/search` — third-party HIS ส่ง `{ "cid": "..." }` (CID เดียว) → ค้นในไฟล์
`drugallergy_*.parquet` บน server ด้วย **DuckDB** (`read_parquet` glob + `WHERE CID =`) →
คืนประวัติแพ้ยา **ทุกคอลัมน์ยกเว้น HOSPCODE, PID, CID** (auth: session Bearer จาก broker)

> multi-CID (`{ "cids": [...] }`) comment ไว้ใน `routes/drugallergy.ts` (ยังไม่เปิดใช้) — uncomment + เปลี่ยน path เมื่อต้องใช้

- **โควตา 10,000 record/วัน ต่อ client (hospcode)** — reset เที่ยงคืนเวลาไทย (ICT), เก็บตัวนับใน Postgres
- ชนโควตา → คืนเท่าที่เหลือ + `truncated: true` · response แนบ `quota: { limit, used, remaining, resetAt }`
- ปิด/เปิดด้วย env:

```bash
DRUGALLERGY_PARQUET_GLOB=/data/drugallergy/drugallergy_*.parquet   # ว่าง = ปิด endpoint
DRUGALLERGY_DAILY_LIMIT=10000
DRUGALLERGY_MAX_CIDS=5000
```

> ต้อง `npm install` (มี native dep `@duckdb/node-api`) และรัน migration `0009` ก่อนใช้

### สลับ mock ↔ real

```bash
AUTH_PROVIDER=mock   # dev: login ด้วยโปรไฟล์จำลอง (GET /auth/providers)
AUTH_PROVIDER=real   # production: OAuth2 กับ MOPH Provider ID — ต้องตั้ง MOPH_PROVIDER_* ครบ
```

env ที่ต้องมีเมื่อ `real` (fail fast ตอน boot ถ้าขาด):

```bash
MOPH_PROVIDER_BASE_URL=https://provider.id.th        # UAT: https://uat-provider.id.th
MOPH_PROVIDER_CLIENT_ID=...
MOPH_PROVIDER_CLIENT_SECRET=...
MOPH_PROVIDER_REDIRECT_URI=https://api-mophlink.moph.go.th/drugallergy/auth/callback
MOPH_PROVIDER_SCOPE=cid name_th name_eng organization
MOPH_PROVIDER_FRONTEND_CALLBACK_URL=https://emac.moph.go.th/
THIRD_PARTY_REDIRECT_ALLOWLIST=                       # comma-separated (ว่าง = ปิด broker)
```

## โครงสร้าง (ports & adapters)

```
src/
  config/      โหลด+validate env (zod) — fail fast ถ้าผิด
  core/        errors, logger, clock, event-bus, DI container
  ports/       interface ทั้งหมด (สัญญา) — domain เรียกผ่านนี้เท่านั้น
  adapters/    implementation จริง/mock (db, auth/moph-provider, keys, ...)
  modules/     feature ราย bounded context (etl, auth, patients, verification, cards)
  http/        express app, middleware, routes
  index.ts     composition root
test/          unit / e2e + helpers/fixtures
```

**หลักการ:** business logic ไม่ผูกกับ framework/DB/external service — สลับ mock ↔ ของจริงที่
`buildContainer` ที่เดียว (เลือกตาม env)

## ETL Ingestion (P1)

ETL จริงรันบน server แยก (DuckDB) แล้ว "โยน" ไฟล์ **parquet** มาวางที่ `data/inbox/`
API ตัวนี้ทำหน้าที่ **import** เข้าตาราง `patient_drugallergy` เท่านั้น

**Column contract** (1 แถว = ยา 1 รายการ ของผู้ป่วย 1 admit):

```
HOSPCODE, PID, DIAGCODE, DATETIME_ADMIT, DIDSTD, DNAME, DATE_SERV
```

```bash
npm run migrate                 # สร้างตาราง (ต้องมี Postgres + DATABASE_URL)
npm run etl:gen-mock            # สร้าง parquet ตัวอย่างใน data/inbox/
npm run etl:import -- --all     # import ทุกไฟล์ใน inbox (manual / cron)
npm run dev                     # เปิด server → file watcher import อัตโนมัติ
```

## Deployment (production)

Backend deploy บนเครื่อง api-mophlink ใต้ path `/drugallergy` (nginx **ไม่ strip prefix**):

```bash
# .env production
PORT=3100                      # ให้ตรงกับ upstream ใน nginx
HTTP_BASE_PATH=/drugallergy
PUBLIC_BASE_URL=https://api-mophlink.moph.go.th/drugallergy
TRUST_PROXY=true
AUTH_PROVIDER=real
# + MOPH_PROVIDER_* ตามหัวข้อ Authentication
```

```bash
# start / restart / log ด้วย pm2
pm2 start ecosystem.config.cjs && pm2 save   # ครั้งแรก (+ pm2 startup กัน reboot)
pm2 restart emac-api                         # หลัง git pull / แก้ .env
pm2 logs emac-api
```

nginx: reverse proxy `/drugallergy/` → `127.0.0.1:3100` + TLS + X-Forwarded-* + rate limit
(RHEL: `setsebool -P httpd_can_network_connect 1` ถ้า nginx ต่อ upstream ไม่ได้)

> **Redirect URL ที่ลงทะเบียนกับ MOPH Provider ID (ต้องตรงเป๊ะ):**
> `https://api-mophlink.moph.go.th/drugallergy/auth/callback`
> UAT กับ PRD ของ Provider ID เป็นคนละระบบ — ลงทะเบียนแยกกัน

## เอกสารสำหรับผู้ใช้ API

- คู่มือฉบับเต็ม (ทุก endpoint + ตัวอย่าง): `docs/api-manual.docx`
- Insomnia collection (import ได้เลย): `docs/insomnia-drugallergy.json`
- OpenAPI spec: `docs/openapi.yaml`

## Test

- unit: logic ล้วน + mock ports (รวม OAuth adapter, state broker)
- e2e: ยิง HTTP จริงผ่าน supertest (app ประกอบด้วย stub adapter, ไม่ต้องมี DB)

Test case map กับ ID ใน `phase-plan.md §3.2`
