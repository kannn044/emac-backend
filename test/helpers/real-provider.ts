import { MockAuthProvider } from '@/adapters/auth/mock-auth.provider';
import type { AuthProvider } from '@/modules/auth/ports';
import { AppError } from '@/core/errors';

export function fakeRealProvider(): AuthProvider {
  const fixture = new MockAuthProvider();
  return {
    kind: 'real',
    listMockProfiles: () => [],
    buildAuthorizeUrl: () => 'https://provider.example/authorize',
    authenticate: async (code) => {
      if (code !== 'test-oauth-code') throw AppError.unauthorized('Invalid test code');
      return fixture.authenticate('mock-pharm-001');
    },
  };
}
