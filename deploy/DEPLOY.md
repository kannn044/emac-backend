# Deploy eMAC บน POC — https://poc.moph.go.th/emac

สองรีโป: **backend** = `emac-backend` (โฟลเดอร์นี้) · **frontend** = `emac-frontend` (โฟลเดอร์ `emac-digital-portal`)

| ส่วน | รันด้วย | พอร์ต | nginx |
|------|---------|-------|-------|
| Backend API | pm2 (`emac-api`) | `127.0.0.1:3100` | `/emac/auth/ /emac/api/ /emac/embed/` → pass-through (ไม่ strip) |
| Frontend | pm2 (`emac-web`, vite preview) | `127.0.0.1:4180` | `/emac` → preview (base `/emac/`) |
| Postgres | docker-compose | `127.0.0.1:5442` | — |

URL หลัง deploy (สะอาด — `api` ชั้นเดียว):
- Frontend: `https://poc.moph.go.th/emac/`
- Login/data: `.../emac/auth/session` · `.../emac/api/v1/patients`
- ตรวจบัตร (public): `.../emac/api/v1/cards/<id>/verify`
- บัตร (embed): `.../emac/embed/card/<token>`

---

## 0) Push ขึ้น GitHub (ทำครั้งแรก บนเครื่อง dev)

```bash
# backend
cd api-drugallergy
git init && git add . && git commit -m "init: eMAC drug allergy API"
git branch -M main
git remote add origin git@github.com:kannn044/emac-backend.git
git push -u origin main

# frontend
cd ../emac-digital-portal
git init && git add . && git commit -m "init: eMAC hospital portal"
git branch -M main
git remote add origin git@github.com:kannn044/emac-frontend.git
git push -u origin main
```

> `.gitignore` กันไม่ให้ `node_modules/`, `.env`, `dist/`, log หลุดขึ้น repo แล้ว
> (`.env.production` ของ frontend commit ได้ — เป็นแค่ `VITE_API_BASE`, ไม่ลับ)

---

## 1) Server prerequisites
Node.js ≥ 20, `pm2` (`npm i -g pm2`), Docker + docker compose, nginx

## 2) Database (Postgres)

```bash
cd emac-backend
cp deploy/.env.production.example .env      # แก้ <STRONG_PASSWORD> และ SESSION_JWT_SECRET
docker compose up -d                        # Postgres ขึ้นที่ 127.0.0.1:5442
docker compose ps                           # ตรวจ healthy
```

> compose อ่าน `POSTGRES_PORT=5442` จาก `.env` → กันชนกับ Postgres โปรเจกต์อื่นบน server

## 3) Backend API (pm2 :3100)

```bash
cd emac-backend
npm ci
npm run migrate                             # สร้างตาราง 0001–0008
npm run seed:patients                       # ใส่ mockup 12 ราย
pm2 start ecosystem.config.cjs              # emac-api → 127.0.0.1:3100
pm2 logs emac-api                           # ดู log
# ทดสอบ (backend mount ใต้ /emac)
curl -s http://127.0.0.1:3100/emac/healthz  # {"status":"ok"}
```

## 4) Frontend (pm2 :4180)

```bash
cd emac-frontend
npm ci
npm run build                               # ได้ dist/ ที่ base=/emac/ + VITE_API_BASE=/emac/api
pm2 start ecosystem.config.cjs              # emac-web → vite preview 127.0.0.1:4180
```

## 5) nginx

เพิ่มเนื้อหาใน [`deploy/nginx/emac.conf`](./nginx/emac.conf) เข้าไปใน `server { }` ของ `poc.moph.go.th`
(วางระดับเดียวกับ `location /freelancecity`, `location /mtbcluster`) แล้ว:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 6) ตรวจสอบ

- เปิด `https://poc.moph.go.th/emac` → หน้า login (เลือกบัญชี mock)
- login เภสัช รพ.ศิริราช → เห็นคิวผู้ป่วย 12 ราย
- เลือกเคส → verify + ลงนาม → บัตรแพ้ยา (iframe) + QR
- สแกน QR / เปิดลิงก์ → `https://poc.moph.go.th/emac/api/v1/cards/<id>/verify` คืน `valid:true`

## อัปเดตครั้งถัดไป

```bash
# backend
cd emac-backend && git pull && npm ci && npm run migrate && pm2 restart emac-api
# frontend
cd emac-frontend && git pull && npm ci && npm run build && pm2 restart emac-web
```

## หมายเหตุเรื่อง path (สำคัญ)

- nginx `location /emac/api/` (และ `/emac/auth/`, `/emac/embed/`) ใช้ `proxy_pass http://127.0.0.1:3100;` **ไม่มี `/` ท้าย** = ส่ง path เดิมทั้งดุ้น (ไม่ strip)
- backend ตั้ง `HTTP_BASE_PATH=/emac` → mount ทุก route ใต้ `/emac` → path ตรงกัน ไม่มี `api` ซ้อน
- `PUBLIC_BASE_URL=https://poc.moph.go.th/emac` ทำให้ QR/embed สร้าง absolute URL ถูกต้อง (`/emac/api/v1/cards/...`, `/emac/embed/card/...`)
- frontend `base=/emac/` + `VITE_API_BASE=/emac`
- ถ้าจะเปลี่ยน domain/subpath: แก้ `HTTP_BASE_PATH`+`PUBLIC_BASE_URL` (backend .env), `base`(vite.config)+`VITE_API_BASE` (frontend), และ prefix ใน nginx
