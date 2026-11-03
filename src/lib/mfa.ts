import { TOTP } from 'otpauth';

export function operatorTotp(secret: string, email?: string) {
  const cleanSecret = (secret || '').trim().toUpperCase().replace(/[\s-]+/g, '');
  return new TOTP({ issuer: 'PDH Smart Health Check', label: email, secret: cleanSecret, algorithm: 'SHA1', digits: 6, period: 30 });
}
export function validOperatorTotp(secret: string, code: string, timestamp = Date.now()) {
  const cleanCode = (code || '').trim().replace(/[\s-]+/g, '');
  return /^\d{6}$/.test(cleanCode) && operatorTotp(secret).validate({ token: cleanCode, window: 1, timestamp }) !== null;
}
