import { describe, it, expect } from 'vitest';
// Deployment's executable validator is also tested without filesystem or VPS access.
// @ts-expect-error The deployment CLI is intentionally native Node ESM.
import { validateSettings } from '../../deploy/shared/validate-env.mjs';
const prod = { DATABASE_URL: 'mysql://pdhcheckup_prod:test-only@127.0.0.1:3306/pdh_healthcheck', NODE_ENV: 'production', SEED_DEMO: 'false', HOSTNAME: '127.0.0.1', PORT: '3036', APP_URL: 'https://pdhcheckup.pluakdaenghospital.cloud', DATA_ENCRYPTION_KEY: 'a'.repeat(64), OTP_PEPPER: 'b'.repeat(64), OTP_PROVIDER: 'unconfigured' };
const stg = { ...prod, DATABASE_URL: 'mysql://pdhcheckup_stg:test-only@127.0.0.1:3306/pdh_healthcheck_staging', PORT: '3037', APP_URL: 'https://staging.example.invalid', DATA_ENCRYPTION_KEY: 'c'.repeat(64), OTP_PEPPER: 'd'.repeat(64) };
describe('deployment environment isolation', () => {
  it('accepts independent loopback production and staging configurations', () => {
    expect(validateSettings(prod, stg, 'production')).toBe(true);
    expect(validateSettings(stg, prod, 'staging')).toBe(true);
  });
  for (const [name, value] of Object.entries({ DATABASE_URL: stg.DATABASE_URL, PORT: '3037', HOSTNAME: '0.0.0.0', APP_URL: 'http://localhost:3036', SEED_DEMO: 'true', OTP_PROVIDER: 'test', DATA_ENCRYPTION_KEY: '', OTP_PEPPER: '' })) {
    it(`rejects invalid production ${name}`, () => expect(() => validateSettings({ ...prod, [name]: value }, stg, 'production')).toThrow());
  }
  it('refuses shared encryption or OTP secrets', () => {
    for (const name of ['DATA_ENCRYPTION_KEY', 'OTP_PEPPER']) expect(() => validateSettings(prod, { ...stg, [name]: prod[name as keyof typeof prod] }, 'production')).toThrow();
  });
  it('refuses staging on the public production origin', () => expect(() => validateSettings({ ...stg, APP_URL: prod.APP_URL }, prod, 'staging')).toThrow());
});
