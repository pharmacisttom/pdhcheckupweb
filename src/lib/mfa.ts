import { TOTP } from 'otpauth';

export function operatorTotp(secret: string, email?: string) {
  const cleanSecret = (secret || '').trim().toUpperCase().replace(/[\s-]+/g, '');
  return new TOTP({ issuer: 'PDH Smart Health Check', label: email, secret: cleanSecret, algorithm: 'SHA1', digits: 6, period: 30 });
}
export function matchingOperatorTotpStep(secret: string, code: string, timestamp = Date.now()) {
  const cleanCode = (code || '').trim().replace(/[\s-]+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return null;
  const totp = operatorTotp(secret);
  const delta = totp.validate({ token: cleanCode, window: 1, timestamp });
  return delta === null ? null : Math.floor(timestamp / 1000 / totp.period) + delta;
}

export function validOperatorTotp(secret: string, code: string, timestamp = Date.now()) {
  return matchingOperatorTotpStep(secret, code, timestamp) !== null;
}
