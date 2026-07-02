import { basename } from 'node:path';
import type { Logger } from '@/core/logger';
import { aggregateRows, type AggregateOptions } from './aggregate';
import { fileChecksum } from './checksum';
import type {
  IngestLogRepository,
  PatientDrugAllergyRepository,
  RowSource,
} from './ports';
import type { IngestRunResult } from './types';

export interface EtlImporterDeps {
  source: RowSource;
  patients: PatientDrugAllergyRepository;
  ingestLog: IngestLogRepository;
  logger: Logger;
  options?: AggregateOptions;
}

/**
 * EtlImporter — orchestration ของการนำไฟล์ ETL เข้าตาราง (workflow.md §2.2)
 *
 *   checksum → กันนำเข้าซ้ำ (idempotent by content)
 *   read (RowSource) → aggregate (drug-level → patient-level)
 *   upsertBatch (repo) → record ingest log
 *
 * ไม่ผูกกับ parquet/pg โดยตรง — สลับ adapter ได้
 */
export class EtlImporter {
  constructor(private readonly deps: EtlImporterDeps) {}

  async importFile(filePath: string): Promise<IngestRunResult> {
    const file = basename(filePath);
    const checksum = await fileChecksum(filePath);
    const log = this.deps.logger.child({ file, checksum });

    if (await this.deps.ingestLog.isAlreadyImported(checksum)) {
      log.info('skip: file already imported (duplicate checksum)');
      const result: IngestRunResult = {
        file,
        checksum,
        status: 'skipped_duplicate',
        rowsRead: 0,
        patientsAffected: 0,
        upsert: { inserted: 0, updated: 0, skipped: 0 },
      };
      await this.deps.ingestLog.record(result);
      return result;
    }

    try {
      const rawRows = await this.deps.source.read(filePath);
      const agg = aggregateRows(rawRows, this.deps.options);
      const upsert = await this.deps.patients.upsertBatch(agg.records);

      const result: IngestRunResult = {
        file,
        checksum,
        status: 'imported',
        rowsRead: agg.rowsRead,
        patientsAffected: agg.records.length,
        upsert,
      };
      await this.deps.ingestLog.record(result);
      log.info(
        {
          rowsRead: agg.rowsRead,
          rowsInvalid: agg.rowsInvalid,
          rowsDropped: agg.rowsDropped,
          patients: agg.records.length,
          ...upsert,
        },
        'import complete',
      );
      return result;
    } catch (err) {
      const result: IngestRunResult = {
        file,
        checksum,
        status: 'failed',
        rowsRead: 0,
        patientsAffected: 0,
        upsert: { inserted: 0, updated: 0, skipped: 0 },
        error: err instanceof Error ? err.message : String(err),
      };
      await this.deps.ingestLog.record(result);
      log.error({ err }, 'import failed');
      return result;
    }
  }
}
