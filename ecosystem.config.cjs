/**
 * PM2 config — eMAC Drug Allergy Card API (POC)
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs emac-api   |   pm2 restart emac-api   |   pm2 save
 *
 * อ่านค่า runtime จาก .env (index.ts โหลด dotenv ให้) — ดู deploy/.env.production.example
 * ฟังที่ 127.0.0.1:3100 ; nginx proxy /emac/api/ → :3100 (strip prefix)
 */
module.exports = {
  apps: [
    {
      name: 'emac-api',
      cwd: __dirname,
      script: 'npm',
      args: 'run start',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
