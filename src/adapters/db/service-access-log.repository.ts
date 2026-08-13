/**
 * PgServiceAccessLogRepository — เขียน access log ของ service endpoint ลง Postgres
 * ตาราง drugallergy_service_access_log (migration 0010)
 */
import type { Pool } from 'pg';
import type {
  ServiceAccessLogEntry,
  ServiceAccessLogRepository,
} from '@/modules/drugallergy/ports';

export class PgServiceAccessLogRepository implements ServiceAccessLogRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async record(entry: ServiceAccessLogEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO drugallergy_service_access_log
         (channel, provider_id, hospcode, client_ip, api_key_id, cid, result_count, status, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.channel,
        entry.providerId,
        entry.hospcode,
        entry.clientIp,
        entry.apiKeyId,
        entry.cid,
        entry.resultCount,
        entry.status,
        entry.requestId,
      ],
    );
  }
}
