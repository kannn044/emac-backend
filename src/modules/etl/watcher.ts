import chokidar, { type FSWatcher } from 'chokidar';
import type { Logger } from '@/core/logger';
import type { EtlImporter } from './importer';

export interface InboxWatcherOptions {
  inboxDir: string;
  /** glob ของไฟล์ที่รับ (default: *.parquet) */
  pattern?: RegExp;
  /** รอไฟล์นิ่งกี่ ms ก่อน import (กัน import ระหว่าง server ยังเขียนไม่เสร็จ) */
  stabilityMs?: number;
}

/**
 * เฝ้าโฟลเดอร์ inbox — เจอไฟล์ ETL ใหม่นิ่งแล้ว import อัตโนมัติ (workflow.md §2: trigger)
 * ไฟล์อยู่กับที่ ไม่ย้าย; กันนำเข้าซ้ำด้วย checksum ใน DB (ingest_log)
 */
export class InboxWatcher {
  private watcher?: FSWatcher;

  constructor(
    private readonly importer: EtlImporter,
    private readonly logger: Logger,
    private readonly options: InboxWatcherOptions,
  ) {}

  start(): void {
    const pattern = this.options.pattern ?? /\.parquet$/i;
    const stability = this.options.stabilityMs ?? 2000;

    this.watcher = chokidar.watch(this.options.inboxDir, {
      ignoreInitial: false, // import ไฟล์ที่ค้างอยู่แล้วด้วย
      awaitWriteFinish: {
        stabilityThreshold: stability,
        pollInterval: 100,
      },
      depth: 0,
    });

    this.watcher.on('add', (path) => {
      if (!pattern.test(path)) return;
      void this.importer.importFile(path).catch((err) => {
        this.logger.error({ err, path }, 'watcher import error');
      });
    });

    this.logger.info({ inbox: this.options.inboxDir }, 'ETL inbox watcher started');
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
  }
}
