/**
 * InMemoryServiceAccessLogRepository — เก็บ access log ใน memory (dev/test)
 * entries เปิดให้ test ตรวจได้
 */
import type {
  ServiceAccessLogEntry,
  ServiceAccessLogRepository,
} from '@/modules/drugallergy/ports';

export class InMemoryServiceAccessLogRepository implements ServiceAccessLogRepository {
  readonly entries: ServiceAccessLogEntry[] = [];

  async record(entry: ServiceAccessLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}
