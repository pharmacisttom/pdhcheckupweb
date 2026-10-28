import { describe, expect, it } from 'vitest';
import { operatorTotp, validOperatorTotp } from '../../src/lib/mfa';
describe('operator TOTP enrollment and login', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  it('matches RFC 6238 SHA1 at 59 seconds (six digits)', () => {
    expect(operatorTotp(secret).generate({ timestamp: 59000 })).toBe('287082');
  });
  it('accepts adjacent steps but refuses two-step drift and malformed input', () => {
    const now = 180000;
    for (const delta of [-1, 0, 1]) expect(validOperatorTotp(secret, operatorTotp(secret).generate({ timestamp: now + delta * 30000 }), now)).toBe(true);
    expect(validOperatorTotp(secret, operatorTotp(secret).generate({ timestamp: now - 60000 }), now)).toBe(false);
    expect(validOperatorTotp(secret, '12345', now)).toBe(false);
    expect(validOperatorTotp(secret, '', now)).toBe(false);
  });
  it('uses the hospital issuer and operator account in enrollment', () => {
    const uri = new URL(operatorTotp(secret, 'operator@example.invalid').toString());
    expect(uri.searchParams.get('issuer')).toBe('PDH Smart Health Check');
    expect(decodeURIComponent(uri.pathname)).toContain('operator@example.invalid');
    expect(uri.searchParams.get('period')).toBe('30');
  });
});
