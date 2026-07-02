import { describe, it, expect } from 'vitest';
import {
  LocalKeyService,
  verifyEd25519,
} from '@/adapters/keys/local-key.service';
import { InMemorySigningKeyStore } from '@/adapters/keys/signing-key.store';
import type { Clock } from '@/ports/index';

const fixedClock: Clock = { now: () => new Date('2026-07-01T00:00:00Z') };

function makeService() {
  return new LocalKeyService(new InMemorySigningKeyStore(), fixedClock);
}

describe('LocalKeyService (Ed25519) — P2-4/P2-5/P2-9', () => {
  it('P2-4: enrolls a keypair on first login', async () => {
    const keys = makeService();
    const keyId = await keys.ensureEnrolled('prov-1');
    expect(keyId).toBeTruthy();
    expect(await keys.getPublicKeyPem('prov-1')).toContain('BEGIN PUBLIC KEY');
  });

  it('P2-5: does not re-enroll on second login (same keyId)', async () => {
    const keys = makeService();
    const first = await keys.ensureEnrolled('prov-1');
    const second = await keys.ensureEnrolled('prov-1');
    expect(second).toBe(first);
  });

  it('P2-9: signature verifies with public key; tampered data fails', async () => {
    const keys = makeService();
    const keyId = await keys.ensureEnrolled('prov-1');
    const pem = (await keys.getPublicKeyPem('prov-1'))!;

    const payload = '{"decision":"verified","drugs":["Carbamazepine"]}';
    const sig = await keys.sign(keyId, payload);

    expect(verifyEd25519(pem, payload, sig)).toBe(true);
    expect(verifyEd25519(pem, payload + ' ', sig)).toBe(false);
  });
});
