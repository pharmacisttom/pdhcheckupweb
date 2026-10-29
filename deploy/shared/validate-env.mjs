import fs from 'node:fs';
export function validateSettings(settings, peer, target) {
const fail = name => { throw new Error(`Invalid or missing deployment setting: ${name}`); };
if (!['production', 'staging'].includes(target)) fail('environment');
const prod = target === 'production';
let database;
try { database = new URL(settings.DATABASE_URL); } catch { fail('DATABASE_URL'); }
if (database.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(database.hostname) || database.pathname !== (prod ? '/pdh_healthcheck' : '/pdh_healthcheck_staging') || decodeURIComponent(database.username) !== (prod ? 'pdhcheckup_prod' : 'pdhcheckup_stg') || !database.password) fail('DATABASE_URL isolation');
for (const [key, value] of Object.entries({ NODE_ENV: 'production', SEED_DEMO: 'false', HOSTNAME: '127.0.0.1', PORT: prod ? '3036' : '3037' })) if (settings[key] !== value) fail(key);
if (!/^[a-f\d]{64}$/i.test(settings.DATA_ENCRYPTION_KEY ?? '')) fail('DATA_ENCRYPTION_KEY');
if ((settings.OTP_PEPPER ?? '').length < 32) fail('OTP_PEPPER');
// Current release intentionally disables OTP. Do not enable test or a delivery provider on VPS without a separate reviewed change.
if (settings.OTP_PROVIDER !== 'disabled') fail('OTP_PROVIDER (this release requires disabled)');
let origin;
try { origin = new URL(settings.APP_URL); } catch { fail('APP_URL'); }
if (origin.protocol !== 'https:' || origin.origin !== settings.APP_URL || (prod && origin.origin !== 'https://pdhcheckup.pluakdaenghospital.cloud') || (!prod && origin.hostname === 'pdhcheckup.pluakdaenghospital.cloud')) fail('APP_URL isolation');
for (const key of ['DATABASE_URL', 'DATA_ENCRYPTION_KEY', 'OTP_PEPPER']) if (!peer[key] || peer[key] === settings[key]) fail(`${key} must differ from peer environment`);
return true;
}
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const target = process.argv[2];
    if (!['production', 'staging'].includes(target)) throw new Error('Invalid environment');
    const { parseEnv } = await import('node:util');
    const peer = parseEnv(fs.readFileSync('/var/www/pdhcheckup/shared/' + (target === 'production' ? 'staging' : 'production') + '/.env', 'utf8'));
    validateSettings(process.env, peer, target);
    console.log('Validated ' + target + ' settings (values withheld).');
  } catch { console.error('Environment validation failed. Review both protected environment files, independent secrets, database accounts, origins and loopback ports.'); process.exitCode = 1; }
}
