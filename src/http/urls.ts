import type { AppConfig } from '@/config/index';

/**
 * สร้าง absolute URL สาธารณะของ service (อยู่หลัง nginx ใต้ /drugallergy)
 *
 * publicBaseUrl เช่น "https://api-mophlink.moph.go.th/drugallergy"
 * → publicUrl(cfg, '/auth/callback') = ".../drugallergy/auth/callback"
 *
 * ใช้กับสิ่งที่ "ออกไปข้างนอก" เสมอ: OIDC redirect_uri, QR ตรวจบัตร, render link, PDF link
 * (อย่า hardcode host/path — ปรับที่ env ที่เดียว)
 */
export function publicUrl(config: AppConfig, path = '/'): string {
  const base = config.http.publicBaseUrl;
  const rel = path.startsWith('/') ? path : `/${path}`;
  if (!base) {
    // dev/test: ไม่มี publicBaseUrl → คืน path (รวม basePath) แบบ relative
    return `${config.http.basePath}${rel}`;
  }
  return `${base.replace(/\/+$/, '')}${rel}`;
}

/** OIDC redirect_uri ที่ต้องไปลงทะเบียนในเอกสารขอใช้ Provider ID */
export function oidcRedirectUri(config: AppConfig): string {
  return publicUrl(config, '/auth/callback');
}
