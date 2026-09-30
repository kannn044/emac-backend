// /home/gdata/emac-backend: database and secrets remain in .env.
module.exports = {
  apps: [
    {
      name: 'emac-api',
      cwd: __dirname,
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3100',
        HTTP_BASE_PATH: '/drugallergy',
        PUBLIC_BASE_URL: 'https://api-mophlink.moph.go.th/drugallergy',
        TRUST_PROXY: 'true',
        AUTH_PROVIDER: 'mock',
      },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
