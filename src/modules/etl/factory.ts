import { isAbsolute, resolve } from 'node:path';
import type { AppConfig } from '@/config/index';
import type { Container } from '@/core/container';
import { ParquetRowSource } from '@/adapters/parquet/parquet-row-source';
import { PgPatientDrugAllergyRepository } from '@/adapters/db/patient-drugallergy.repository';
import { PgIngestLogRepository } from '@/adapters/db/ingest-log.repository';
import { EtlImporter } from './importer';
import { InboxWatcher } from './watcher';

/** path ของ inbox (รองรับทั้ง absolute และ relative จาก cwd) */
export function getInboxDir(config: AppConfig): string {
  const dir = config.etl.inboxDir;
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/** ประกอบ EtlImporter จาก container (parquet + PG repos) */
export function buildEtlImporter(container: Container): EtlImporter {
  return new EtlImporter({
    source: new ParquetRowSource(),
    patients: new PgPatientDrugAllergyRepository(container.db),
    ingestLog: new PgIngestLogRepository(container.db),
    logger: container.logger,
    options: { dropDrugsAfterAdmit: container.config.etl.dropDrugsAfterAdmit },
  });
}

/** ประกอบ + start file watcher (เรียกจาก server bootstrap) */
export function startEtlWatcher(container: Container): InboxWatcher {
  const importer = buildEtlImporter(container);
  const watcher = new InboxWatcher(importer, container.logger, {
    inboxDir: getInboxDir(container.config),
  });
  watcher.start();
  return watcher;
}
