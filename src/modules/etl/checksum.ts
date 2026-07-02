import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** sha256 ของเนื้อไฟล์ — ใช้ track ว่าไฟล์ (เนื้อหา) นี้ถูก import แล้วหรือยัง */
export function fileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
