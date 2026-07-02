/**
 * Canonical serialization — แปลง object เป็น string ที่ deterministic (คีย์เรียงเสมอ)
 * ใช้สร้าง payload ก่อนเซ็น → ตรวจภายหลังได้ผลเดิม (แก้ 1 byte = ลายเซ็นไม่ผ่าน)
 *
 * ไม่ใช้ JSON.stringify ตรง ๆ เพราะลำดับคีย์ไม่การันตี → ต้อง sort เอง (recursive)
 */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalize(payload: unknown): string {
  return JSON.stringify(sortValue(payload));
}
