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

`PORTAL_AUTH_PROVIDER=mock`: เลือกบัญชีทดสอบผ่าน `/api/v1/portal/auth/providers` และ `/api/v1/portal/auth/session`; real ใช้ flow ด้านล่าง

`GET /api/v1/portal/auth/login` → 302 ไปหน้า login MOPH Provider ID → callback กลับที่
`/auth/callback` → เด้ง `?code` ไป frontend (`MOPH_PROVIDER_FRONTEND_CALLBACK_URL`) →
frontend `POST /api/v1/portal/auth/callback {code}` → ได้ `{ token, expiresAt, profile }`

### 2) Third-party broker (ระบบภายนอก เช่น HIS)

ระบบภายนอกไม่ต้องมี client id/secret ของ Provider ID — ใช้ API นี้เป็น broker:

```
GET /auth/login?redirect_to=https://his-a.go.th/callback&state=<csrf-ของเขา>
  → user login กับ Provider ID
  → ระบบเด้ง https://his-a.go.th/callback?code=...&state=<csrf-เดิม>
  → backend ของเขา POST /auth/callback {code} → session JWT → เรียก /api/v1/drugallergy/search
```

### Token lifetime & refresh

Portal ใช้ `/api/v1/portal/auth/refresh` และ third party ใช้ `/auth/refresh` เท่านั้น Token ใช้ข้ามช่องทางไม่ได้

`POST /auth/callback` (และ portal mock `/api/v1/portal/auth/session`) คืน **access token + refresh token**:

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

### แยก third-party production ออกจากหน้าเว็บ

- `/auth/*` และ `/api/v1/drugallergy/search` เป็น third-party production เสมอ: Provider ID จริง + Parquet จริง ไม่ขึ้นกับ `AUTH_PROVIDER`, `PORTAL_AUTH_PROVIDER` หรือ `DRUGALLERGY_DATA_MODE`
- หน้าเว็บ login ผ่าน `/api/v1/portal/auth/*` โดยเลือก `PORTAL_AUTH_PROVIDER=mock|real` (หากไม่กำหนด จะใช้ `AUTH_PROVIDER` เดิมเป็น fallback เฉพาะหน้าเว็บ)
- Token และ refresh token แยกสองช่องทาง ใช้ข้ามกันไม่ได้ และ token แบบเดิมก่อนอัปเดตจะใช้ไม่ได้ ต้อง login ใหม่หนึ่งครั้ง
- `/search` ใช้ PostgreSQL สำหรับ quota เสมอ และ access log ของ third-party ใช้ PostgreSQL ไม่ขึ้นกับ `DATA_STORE` ของหน้าเว็บ
- `/lookup` ยังคง API key + IP allowlist และเลือกข้อมูลด้วย `DRUGALLERGY_DATA_MODE=mock|real` (ค่าเริ่มต้น real) โหมด mock มี `MOCK-CID-001` และ `MOCK-CID-002`
- Header `X-Drugallergy-Data-Mode` ของ search เป็น `real` เสมอ; lookup เป็นค่าตามโหมดของตน
- ต้องมี Provider ID credentials และ Parquet path จริงใน env: คำว่า “เสมอ” หมายถึงไม่มีสวิตช์เปลี่ยน search เป็น mock ไม่ใช่การ hardcode secret
- ถ้าไม่มี Provider ID config จะตอบ 503 ตอนเริ่ม OAuth/แลก code; ไม่มี Parquet glob จะตอบ 503 ตอนค้น ไม่ fallback เป็นข้อมูล mock

```dotenv
PORTAL_AUTH_PROVIDER=mock
MOPH_PROVIDER_BASE_URL=https://provider.id.th
MOPH_PROVIDER_CLIENT_ID=<ค่าที่ได้รับอนุมัติ>
MOPH_PROVIDER_CLIENT_SECRET=<ค่าที่ได้รับอนุมัติ>
MOPH_PROVIDER_REDIRECT_URI=https://api-mophlink.moph.go.th/drugallergy/auth/callback
DRUGALLERGY_PARQUET_GLOB=/data/drugallergy/drugallergy_*.parquet
DRUGALLERGY_DATA_MODE=real
```

คง `THIRD_PARTY_REDIRECT_ALLOWLIST` ของ partner, `DATABASE_URL`, `SESSION_JWT_SECRET` และ SERVICE_API_KEYS/SERVICE_ALLOWLIST_IPS เดิมไว้ ไม่ต้องเปลี่ยน URL callback ที่ลงทะเบียนกับ Provider ID

หลัง deploy โค้ด **ทั้ง backend และ frontend**:

```bash
# เครื่อง backend (ไม่มี npm run build; รันผ่าน tsx)
cd /home/gdata/emac-backend
npm ci
npm run typecheck
pm2 restart emac-api --update-env

# เครื่อง frontend
cd /home/gdata/emac/emac-frontend
npm ci
npm run build:emac
pm2 restart emac-web --update-env
```

ไม่ต้อง migration ใหม่สำหรับการแยก auth นี้ แต่ฐานข้อมูลต้องมีตาราง quota/access log จาก migrations เดิมแล้ว
Frontend ใช้ `/api/v1/portal/auth/*` จึงผ่าน nginx `location /api/` เดิมได้ ไม่ต้องเพิ่ม location ใหม่
อัปเดตทั้งสองฝั่งในช่วงเดียวกัน: frontend เก่าที่เรียก `/auth/*` จะไม่สามารถใช้ mock login ได้

ตรวจหลัง deploy:

```bash
# ต้องได้ real (third party)
curl -i https://api-mophlink.moph.go.th/drugallergy/auth/mode
# ต้องได้ mock (portal)
curl -i https://emac.moph.go.th/api/v1/portal/auth/mode
# ต้องได้ 302 ไป Provider ID เมื่อ credentials ครบ
curl -I https://api-mophlink.moph.go.th/drugallergy/auth/login
```

ให้ partner login ใหม่ผ่าน `/auth/login` → `/auth/callback` และใช้ session Bearer ของ eMAC เรียก `/api/v1/drugallergy/search` ตามเดิม
การตรวจ Provider ID จริงต้องทดสอบบน deployment ที่มี client credentials และ callback ที่อนุมัติ ไม่ได้ทดสอบบัญชีจริงจากเครื่องพัฒนานี้

### รูปแบบการค้นหา

`POST /api/v1/drugallergy/search` — third-party HIS ส่ง `{ "cid": "..." }` (CID เดียว) → ค้นในไฟล์
`drugallergy_*.parquet` บน server ด้วย **DuckDB** (`read_parquet` glob + `WHERE CID =`) →
คืนประวัติแพ้ยา **ทุกคอลัมน์ยกเว้น HOSPCODE, PID, CID** (auth: session Bearer จาก broker)

> multi-CID (`{ "cids": [...] }`) comment ไว้ใน `routes/drugallergy.ts` (ยังไม่เปิดใช้) — uncomment + เปลี่ยน path เมื่อต้องใช้

### Service endpoint (M2M — ไม่ผ่าน Provider ID)

`POST /api/v1/drugallergy/lookup` — สำหรับ backend ของเราเอง auth ด้วย **fixed IP + API key** เท่านั้น
(ไม่ผ่าน Provider ID, **ไม่มีโควตา**) → คืน **ทุกคอลัมน์ในไฟล์ parquet รวม HOSPCODE/PID/CID**

```bash
# request
POST /api/v1/drugallergy/lookup
X-API-Key: <key>
{ "cid": "1234567890123" }
# → { "records": [ { HOSPCODE, PID, CID, DATERECORD, DRUGALLERGY, DNAME, ... } ], "count": N }
```

auth 2 ชั้น: (1) client IP (จาก `CF-Connecting-IP`) ต้องอยู่ใน allowlist  (2) `X-API-Key` ตรง (timing-safe)
ปิดโดย default — ต้องตั้งทั้ง 2 ค่าถึงจะเปิด:

```bash
SERVICE_API_KEYS=<random-long-key1,key2>       # หลายตัวเพื่อ rotate
SERVICE_ALLOWLIST_IPS=<public-ip-ของ-server>    # IP ที่ Cloudflare เห็น
SERVICE_CLIENT_IP_HEADER=cf-connecting-ip
SERVICE_MAX_RECORDS=2000
```

> ⚠️ endpoint นี้ bypass การ auth แบบ strong (Provider ID) — ทั้ง IP และ key ต้องเก็บเป็นความลับ
> แนะนำ **enforce IP ที่ nginx/Cloudflare ด้วย** (defense in depth) และ rotate key เป็นระยะ

**Access log** — ทุกการเรียก **ทั้ง `/drugallergy/search` และ `/drugallergy/lookup`** (สำเร็จ + ถูกปฏิเสธ)
ถูกบันทึกลงตารางเดียวกัน `drugallergy_service_access_log` (migration 0010 + 0011):
`ts, channel (search|lookup), provider_id, hospcode, client_ip, api_key_id (fingerprint),
cid (ดิบ), result_count, status, request_id`

- `channel='search'` → ผูก `provider_id` + `hospcode` (จาก session Provider ID)
- `channel='lookup'` → ผูก `client_ip` + `api_key_id` (M2M)

> ⚠️ ตารางนี้เก็บ **CID ดิบ = PII** → คุมสิทธิ์เข้าถึง DB + ตั้ง retention (แนะนำ purge > 2 ปี) ตาม PDPA
> ตัวอย่างรายงาน: `SELECT ts, channel, provider_id, client_ip, cid, result_count, status FROM drugallergy_service_access_log ORDER BY ts DESC;`
> ต้องรัน `npm run migrate` (0010 + 0011) ก่อนใช้

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
PORTAL_AUTH_PROVIDER=mock   # หน้าเว็บ: GET /api/v1/portal/auth/providers
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

## ข้อมูลผู้ป่วย mock

ชุด demo 12 รายใช้ชื่อ `ผู้ป่วยทดสอบ 001–012`, PID `MOCK-PID-001`, HN `MOCK-HN-001`,
ไม่มี CID/วันเกิด และที่อยู่ระบุว่าเป็นข้อมูลทดสอบ ข้อมูลยา/อาการยังคงใช้สาธิตได้

สำหรับฐานข้อมูลเดิม หลังอัปโหลดโค้ดใหม่:

```bash
cd /home/gdata/emac-backend
npm run migrate
pm2 restart emac-api
```

Migration `0014_normalize_all_legacy_mock_patients.sql` ครอบคลุม seed เก่า 12 ราย
ทุกชื่อ/CID ที่เคยใช้ โดยจับคู่ natural key + โรงพยาบาล + PID + HN
แทนการตรวจชื่อแบบ migration 0012/0013 คง primary key, ข้อมูลคลินิก, สถานะและหมายเหตุไว้
พร้อมเปลี่ยน natural key ให้ตรงกับ PID ใหม่ แถวที่ไม่ตรงกับรหัสอ้างอิงชุด seed จะไม่ถูกแก้

หลัง migrate ตรวจฐานข้อมูลจริงแบบ read-only:

```bash
npm run audit:mock-patients
```

`remainingPatients` ต้องเป็น 0 หากฐานข้อมูลนี้มีเฉพาะชุด mock ดังกล่าว
หากมากกว่า 0 ให้ตรวจ `remainingPatientRowIds` ต่อ (คำสั่งไม่พิมพ์ชื่อ/PID/HN)
`historicalCardsWithOldIdentity` นับบัตร snapshot เดิมที่ยังมีข้อมูลระบุตัวตนรูปแบบเก่า
คำสั่งคืน exit code 1 ถ้ามีข้อมูลเหลือ ไม่ได้แปลว่าการ migrate ล้มเหลว

สำหรับฐานข้อมูลใหม่ รัน `npm run migrate` **ก่อน** `npm run seed:patients`
การ migrate ไม่เพิ่มผู้ป่วยเอง ส่วน seed จะข้าม natural key ที่มีอยู่แล้ว
อย่า seed ชุดใหม่ลงฐานข้อมูลเก่าก่อน migrate เพราะจะสร้างแถวซ้ำคนละ natural key

บัตรที่ออกแล้วและข้อมูลที่ลงนามเป็น snapshot เดิม ไม่ถูกแก้ย้อนหลังโดย migration นี้
ชื่อและรหัสเก่าอาจยังปรากฏบนบัตรเหล่านั้น; บัตรที่ออกใหม่ใช้ข้อมูล mock ใหม่

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
