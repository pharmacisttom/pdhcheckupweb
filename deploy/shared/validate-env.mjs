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
const emailProvider = settings.EMAIL_PROVIDER ?? 'disabled';
if(!['disabled','smtp','resend'].includes(emailProvider)) fail('EMAIL_PROVIDER');
if(emailProvider!=='disabled') {
 if(settings.EMAIL_SENDER_VERIFIED!=='true'||!/^\S+@[^\s@]+\.[^\s@]+$/.test(settings.EMAIL_FROM??'')||/[\r\n]/.test(settings.EMAIL_FROM??'')) fail('verified EMAIL_FROM');
 if(emailProvider==='smtp' && (!settings.SMTP_HOST||!['465','587'].includes(settings.SMTP_PORT??'587')||!settings.SMTP_USER||!settings.SMTP_PASSWORD)) fail('SMTP settings');
 if(emailProvider==='resend'&&!settings.RESEND_API_KEY) fail('RESEND_API_KEY');
 for(const key of ['SMTP_PASSWORD','RESEND_API_KEY'])if(settings[key]&&settings[key]===peer[key])fail(key+' must differ from peer environment');
}
for(const key of ['CHAT_ENABLED','CHAT_AI_ENABLED','CHAT_EXTERNAL_PROCESSING_APPROVED']) if(settings[key]!==undefined&&!['true','false'].includes(settings[key]))fail(key);
const chatProvider=settings.CHAT_AI_PROVIDER??'disabled';
if(!['disabled','openai','compatible'].includes(chatProvider))fail('CHAT_AI_PROVIDER');
if(settings.CHAT_AI_ENABLED==='true'){
 if(settings.CHAT_ENABLED!=='true'||settings.CHAT_EXTERNAL_PROCESSING_APPROVED!=='true'||chatProvider==='disabled'||!settings.CHAT_AI_MODEL||settings.CHAT_AI_MODEL.length>100||!settings.CHAT_AI_API_KEY)fail('approved CHAT AI settings');
 const cost=Number(settings.CHAT_AI_MAX_CALL_USD);if(!Number.isFinite(cost)||cost<=0||cost>10)fail('CHAT_AI_MAX_CALL_USD');
 if(chatProvider==='compatible'){let endpoint;try{endpoint=new URL(settings.CHAT_AI_ENDPOINT);}catch{fail('CHAT_AI_ENDPOINT');}if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash)fail('CHAT_AI_ENDPOINT');}
 if(settings.CHAT_AI_API_KEY===peer.CHAT_AI_API_KEY)fail('CHAT_AI_API_KEY must differ from peer environment');
}
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
