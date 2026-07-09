# Deploy eMAC บน Production — https://emac.moph.go.th

ต่างจาก POC (`deploy/DEPLOY.md`) ตรงที่ domain นี้เป็นของ eMAC **เอง** (ไม่แชร์ path กับ service อื่น)
→ ระบบจึงรันที่ **root** ของ domain (ไม่มี prefix `/emac` แล้ว)

สองรีโป: **backend** = `emac-backend` (โฟลเดอร์นี้) · **frontend** = `emac-frontend` (โฟลเดอร์ `emac-digital-portal`)

| ส่วน | รันด้วย | พอร์ต | nginx |
|------|---------|-------|-------|
| Backend API | pm2 (`emac-api`) | `127.0.0.1:3100` | `/auth/ /api/ /embed/` → proxy (ไม่ strip) |
| Frontend | ไฟล์ static (`dist/`) | — | `/` → nginx serve ตรง (ไม่ต้องรัน process) |
| Postgres | docker-compose | `127.0.0.1:5442` | — |

URL หลัง deploy:
- Frontend: `https://emac.moph.go.th/`
- Login/data: `.../auth/session` · `.../api/v1/patients`
- ตรวจบัตร (public): `.../api/v1/cards/<id>/verify`
- บัตร (embed): `.../embed/card/<token>`

> ทั้งหมดนี้ตั้งผ่าน env/config เท่านั้น — **ไม่มีจุดไหนในโค้ดที่ hardcode domain** ดูหัวข้อ
> ["ถ้าต้องเปลี่ยน domain อีกในอนาคต"](#ถ้าต้องเปลี่ยน-domain-อีกในอนาคต) ท้ายไฟล์นี้

---

## 1) Server prerequisites

Node.js ≥ 20, `pm2` (`npm i -g pm2`), Docker + docker compose, nginx, SSL cert ของ `emac.moph.go.th`

## 2) Database (Postgres)

```bash
cd emac-backend
cp deploy/.env.emac-production.example .env    # แก้ <STRONG_PASSWORD> และ SESSION_JWT_SECRET
docker compose up -d                            # Postgres ขึ้นที่ 127.0.0.1:5442
docker compose ps                               # ตรวจ healthy
```

## 3) Backend API (pm2 :3100)

```bash
cd emac-backend
npm ci
npm run migrate                # สร้างตาราง
npm run seed:patients          # (ถ้าต้องการ mock data — ข้ามได้ถ้า production จริง)
pm2 start ecosystem.config.cjs # emac-api → 127.0.0.1:3100
pm2 logs emac-api

# ทดสอบ (backend mount ที่ root แล้ว — ไม่มี /emac)
curl -s http://127.0.0.1:3100/healthz   # {"status":"ok"}
```

## 4) Frontend (build → static, ไม่ต้องรัน process)

```bash
cd emac-frontend
npm ci
npm run build:emac             # ใช้ .env.production-emac → base '/', VITE_API_BASE ว่าง (same-origin)
```

`npm run build:emac` = `vite build --mode production-emac` — โหลดค่าใน `.env.production-emac`
(root path, ไม่มี subpath) แทน `.env.production` ที่เป็นของ POC (subpath `/emac`)

คัดลอกผลลัพธ์ไปที่ path ที่ nginx จะ serve (ตรงกับ `root` ใน nginx conf):

```bash
sudo mkdir -p /var/www/emac-frontend
sudo rsync -a --delete dist/ /var/www/emac-frontend/dist/
```

> ทางเลือก: ถ้าอยากรันแบบเดียวกับ POC (vite preview ผ่าน pm2) ก็ทำได้ —
> `npm run preview:emac` (พอร์ตอ่านจาก `VITE_PREVIEW_PORT` ใน env, default 4180) แล้วให้ nginx
> proxy_pass ไปแทนที่จะ serve static แต่วิธี static ข้างบนเบากว่าและไม่ต้องมี node process ของ frontend

## 5) nginx

ใช้ [`deploy/nginx/emac-production.conf`](./nginx/emac-production.conf) เป็น server block แยกทั้งไฟล์
(domain เดี่ยว ไม่ต้อง merge เข้ากับ server อื่นแบบ POC):

```bash
sudo cp deploy/nginx/emac-production.conf /etc/nginx/conf.d/emac-production.conf
# แก้ path ssl_certificate / ssl_certificate_key และ root (static dist) ให้ตรงกับเครื่องจริง
sudo nginx -t && sudo systemctl reload nginx
```

## 6) ตรวจสอบ

- เปิด `https://emac.moph.go.th/` → หน้า login
- login → เห็นคิวผู้ป่วย
- เลือกเคส → verify + ลงนาม → บัตรแพ้ยา (iframe) + QR
- สแกน QR / เปิดลิงก์ → `https://emac.moph.go.th/api/v1/cards/<id>/verify` คืน `valid:true`
- ถ้าเปลี่ยนไปใช้ `AUTH_PROVIDER=real` ภายหลัง ต้องลงทะเบียน redirect URI
  `https://emac.moph.go.th/auth/callback` กับ MOPH Provider ID ก่อน (ดู `docs/moph-providerid-request.md`)

## อัปเดตครั้งถัดไป

```bash
# backend
cd emac-backend && git pull && npm ci && npm run migrate && pm2 restart emac-api
# frontend
cd emac-frontend && git pull && npm ci && npm run build:emac \
  && sudo rsync -a --delete dist/ /var/www/emac-frontend/dist/
```

---

## ถ้าต้องเปลี่ยน domain อีกในอนาคต

ระบบถูกออกแบบให้ domain/path เป็น **config ล้วน ๆ** ไม่มี hardcode ในโค้ด — ย้าย/เพิ่ม environment
ใหม่ทำได้โดยแก้แค่ไฟล์ config เหล่านี้ (ไม่ต้องแตะ `src/`):

| ต้องการเปลี่ยน | แก้ที่ (backend) | แก้ที่ (frontend) |
|---|---|---|
| Domain | `PUBLIC_BASE_URL` ใน `.env` | `VITE_ALLOWED_HOSTS` ใน `.env.<mode>` (สำหรับ `vite preview` เท่านั้น — ถ้า serve static ผ่าน nginx ไม่ต้องแก้) |
| Subpath (เช่น `/emac`, หรือว่าง = root) | `HTTP_BASE_PATH` ใน `.env` | `VITE_BASE_PATH` + `VITE_API_BASE` ใน `.env.<mode>` |
| Port ที่ service ฟัง | `PORT` ใน `.env` | `VITE_PREVIEW_PORT` (ถ้าใช้ vite preview) |
| nginx routing | เขียน server block ใหม่ตาม `deploy/nginx/*.conf` เป็นตัวอย่าง (path-based ให้ดู `api-mophlink.conf`, domain เดี่ยวให้ดู `emac-production.conf`) | — |

Backend: `src/config/index.ts` โหลด/validate ค่าพวกนี้จาก env ที่จุดเดียว (zod schema) แล้ว
`src/http/urls.ts` ใช้ `config.http.publicBaseUrl` + `config.http.basePath` สร้าง absolute URL ทุกที่
(OIDC redirect, QR, embed link) — ไม่มีที่ไหน hardcode `poc.moph.go.th` หรือ `emac.moph.go.th` ในโค้ด

Frontend: `vite.config.ts` อ่าน `VITE_BASE_PATH`/`VITE_ALLOWED_HOSTS`/`VITE_PREVIEW_PORT` จาก
mode-specific env file (`.env.production`, `.env.production-emac`, หรือเพิ่ม mode ใหม่ได้ตามต้องการ)
แล้ว `lib/apiClient.ts` อ่าน `VITE_API_BASE` ตอน build — ไม่มี domain hardcode ในโค้ดเช่นกัน
