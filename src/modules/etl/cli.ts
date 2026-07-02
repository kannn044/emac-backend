/**
 * CLI สำรองสำหรับ import แบบ manual / ใช้กับ cron (workflow.md §2)
 *
 *   npx tsx src/modules/etl/cli.ts <file.parquet> [file2.parquet ...]
 *   npx tsx src/modules/etl/cli.ts --all            # import ทุกไฟล์ใน inbox
 *
 * ใช้ composition root เดียวกับ server (เลือก adapter ตาม env)
 */
import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '@/config/index';
import { buildContainer } from '@/core/container';
import { buildEtlImporter, getInboxDir } from './factory';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const config = loadConfig();
  const container = buildContainer(config);
  const importer = buildEtlImporter(container);

  let files: string[];
  if (args.includes('--all') || args.length === 0) {
    const inbox = getInboxDir(config);
    const entries = await readdir(inbox);
    files = entries
      .filter((f) => /\.parquet$/i.test(f))
      .map((f) => join(inbox, f));
  } else {
    files = args;
  }

  if (files.length === 0) {
    container.logger.warn('no parquet files to import');
  }

  for (const file of files) {
    const result = await importer.importFile(file);
    container.logger.info({ result }, 'imported');
  }

  await container.shutdown();
}

main().catch((err) => {
  console.error('ETL CLI error:', err);
  process.exit(1);
});
