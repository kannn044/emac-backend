import { describe, it, expect } from 'vitest';
import { loadConfig } from '@/config/index';
import { oidcRedirectUri, publicUrl } from '@/http/urls';

const ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  SESSION_JWT_SECRET: 'a-strong-secret',
};

describe('public URL builder', () => {
  it('builds absolute URL from publicBaseUrl', () => {
    const cfg = loadConfig({
      ...ENV,
      HTTP_BASE_PATH: '/drugallergy',
      PUBLIC_BASE_URL: 'https://api-mophlink.moph.go.th/drugallergy',
    });
    expect(publicUrl(cfg, '/cards/123/verify')).toBe(
      'https://api-mophlink.moph.go.th/drugallergy/cards/123/verify',
    );
    expect(oidcRedirectUri(cfg)).toBe(
      'https://api-mophlink.moph.go.th/drugallergy/auth/callback',
    );
  });

  it('falls back to relative path (with base) when no publicBaseUrl', () => {
    const cfg = loadConfig({ ...ENV, HTTP_BASE_PATH: '/drugallergy' });
    expect(oidcRedirectUri(cfg)).toBe('/drugallergy/auth/callback');
  });

  it('normalizes base path (trailing slash, missing leading slash)', () => {
    const cfg = loadConfig({ ...ENV, HTTP_BASE_PATH: 'drugallergy/' });
    expect(cfg.http.basePath).toBe('/drugallergy');
  });
});
