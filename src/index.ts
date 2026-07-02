import 'dotenv/config';
import { loadConfig } from '@/config/index';
import { buildContainer } from '@/core/container';
import { createApp } from '@/http/app';
import { startEtlWatcher } from '@/modules/etl/factory';

/**
 * Composition root — จุดเดียวที่ประกอบทุกอย่างเข้าด้วยกันแล้วเปิดเซิร์ฟเวอร์
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const container = buildContainer(config);
  const app = createApp(container);

  // P1: เฝ้าโฟลเดอร์ inbox — import ไฟล์ ETL อัตโนมัติ
  const etlWatcher = startEtlWatcher(container);

  const server = app.listen(config.port, () => {
    container.logger.info(
      {
        port: config.port,
        env: config.env,
        basePath: config.http.basePath || '/',
        publicBaseUrl: config.http.publicBaseUrl ?? '(relative)',
      },
      'drug-allergy API listening',
    );
  });

  const shutdown = (signal: string) => {
    container.logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await etlWatcher.stop();
      await container.shutdown();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // boot ล้ม (เช่น config ผิด) → log แล้วออกด้วย exit code 1
  console.error('Fatal boot error:', err);
  process.exit(1);
});
