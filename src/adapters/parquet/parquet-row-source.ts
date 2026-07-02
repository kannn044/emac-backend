import parquet from '@dsnp/parquetjs';
import type { RowSource } from '@/modules/etl/ports';

/**
 * RowSource ที่อ่านไฟล์ .parquet ด้วย pure-Node lib (@dsnp/parquetjs)
 * ไม่มี native binding — รันได้ทุก platform
 *
 * คืน raw rows (Record) แล้วให้ importer/aggregate validate ด้วย zod เอง
 */
export class ParquetRowSource implements RowSource {
  readonly format = 'parquet';

  async read(filePath: string): Promise<Record<string, unknown>[]> {
    const reader = await parquet.ParquetReader.openFile(filePath);
    try {
      const cursor = reader.getCursor();
      const rows: Record<string, unknown>[] = [];
      let record: unknown;
      while ((record = await cursor.next())) {
        rows.push(record as Record<string, unknown>);
      }
      return rows;
    } finally {
      await reader.close();
    }
  }
}
