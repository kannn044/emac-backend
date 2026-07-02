import { createHash } from 'node:crypto';

/**
 * Normalize diagcode ของอาการแพ้ยารุนแรง (SJS/TEN) → L511 | L512 | L519
 * อิง sjs-ten.ipynb (diagnosis_ipd WHERE diagcode LIKE 'L51%')
 *
 *   L511 = SJS, L512 = TEN, L519 = unspecified
 *   อย่างอื่นที่ขึ้นต้น L51 → ตกเป็น L519 (unspecified)
 *   ไม่ใช่ L51 → null (ไม่เข้าเกณฑ์ ควรถูกกรองออกตั้งแต่ ETL)
 */
export function normalizeDiagcode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/\./g, '');
  if (!code.startsWith('L51')) return null;
  if (code.startsWith('L511')) return 'L511';
  if (code.startsWith('L512')) return 'L512';
  if (code.startsWith('L519')) return 'L519';
  // L51, L510, L513.. → unspecified
  return 'L519';
}

/** แปลง Date/string เป็น YYYY-MM-DD (date เดียว ไม่มีเวลา) */
export function toDateOnly(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid date: ${String(value)}`);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * natural_key = sha256(hospcode | pid | datetime_admit(date) | diagcode)
 * ทำให้ ETL idempotent: ไฟล์เดียวกัน/แถวเดียวกันให้ key เดิมเสมอ
 */
export function computeNaturalKey(input: {
  hospcode: string;
  pid: string;
  datetimeAdmit: string; // YYYY-MM-DD
  diagcode: string;
}): string {
  const canonical = [
    input.hospcode.trim(),
    input.pid.trim(),
    input.datetimeAdmit,
    input.diagcode,
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}
