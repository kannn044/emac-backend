import { describe, it, expect } from 'vitest';
import { loadConfig } from '@/config/index';

const VALID: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  SESSION_JWT_SECRET: 'a-strong-secret',
};

describe('config (P0-3)', () => {
  it('keeps third-party data mode independent from login and portal storage', () => {
    expect(loadConfig(VALID).drugAllergy.dataMode).toBe('real');
    const cfg = loadConfig({ ...VALID, DRUGALLERGY_DATA_MODE: 'mock', DATA_STORE: 'postgres' });
    expect(cfg.drugAllergy.dataMode).toBe('mock');
    expect(cfg.adapters.dataStore).toBe('postgres');
    expect(cfg.adapters.authProvider).toBe('mock');
    expect(() => loadConfig({ ...VALID, DRUGALLERGY_DATA_MODE: 'typo' })).toThrow();
  });
  it('allows an explicit mock portal independent of legacy AUTH_PROVIDER=real', () => {
    const cfg = loadConfig({ ...VALID, AUTH_PROVIDER: 'real', PORTAL_AUTH_PROVIDER: 'mock' });
    expect(cfg.adapters.portalAuthProvider).toBe('mock');
    expect(() => loadConfig({ ...VALID, PORTAL_AUTH_PROVIDER: 'real' })).toThrow(/MOPH_PROVIDER/);
  });
  it('loads valid config with defaults', () => {
    const cfg = loadConfig(VALID);
    expect(cfg.port).toBe(3000);
    expect(cfg.etl.retroWindowDays).toBe(30);
    expect(cfg.adapters.authProvider).toBe('mock');
    expect(cfg.rollout.hospcodeAllowlist).toEqual([]);
  });

  it('throws when required field missing (fail fast)', () => {
    const { DATABASE_URL, ...withoutDb } = VALID;
    void DATABASE_URL;
    expect(() => loadConfig(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('throws when SESSION_JWT_SECRET too short', () => {
    expect(() => loadConfig({ ...VALID, SESSION_JWT_SECRET: 'x' })).toThrow(
      /SESSION_JWT_SECRET/,
    );
  });

  it('parses hospcode allowlist from comma string', () => {
    const cfg = loadConfig({ ...VALID, HOSPCODE_ALLOWLIST: '10670, 10671 ,10672' });
    expect(cfg.rollout.hospcodeAllowlist).toEqual(['10670', '10671', '10672']);
  });

  it('coerces numeric retro window', () => {
    const cfg = loadConfig({ ...VALID, RETRO_WINDOW_DAYS: '45' });
    expect(cfg.etl.retroWindowDays).toBe(45);
  });
});
