/**
 * โควตา reset เที่ยงคืนเวลาไทย (ICT = UTC+7) — ไม่มี DST
 * quotaDate = วันที่ในเขต ICT; resetAt = เที่ยงคืน ICT ครั้งถัดไป (แสดงเป็น UTC ISO)
 */
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

/** วันที่เขต ICT (YYYY-MM-DD) ของเวลา now */
export function ictQuotaDate(now: Date): string {
  return new Date(now.getTime() + ICT_OFFSET_MS).toISOString().slice(0, 10);
}

/** เที่ยงคืน ICT ครั้งถัดไป → UTC ISO string */
export function ictNextResetAt(now: Date): string {
  const shifted = new Date(now.getTime() + ICT_OFFSET_MS);
  // เที่ยงคืนวันถัดไปในเขต ICT (คำนวณบน UTC ของเวลาที่ shift แล้ว)
  const nextMidnightShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  );
  // แปลงกลับเป็น UTC จริง
  return new Date(nextMidnightShifted - ICT_OFFSET_MS).toISOString();
}
