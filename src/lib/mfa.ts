import { TOTP } from 'otpauth';

export function operatorTotp(secret: string, email?: string) {
  return new TOTP({ issuer: 'PDH Smart Health Check', label: email, secret, algorithm: 'SHA1', digits: 6, period: 30 });
}
export function validOperatorTotp(secret: string, code: string, timestamp = Date.now()) {
  return /^\d{6}$/.test(code) && operatorTotp(secret).validate({ token: code, window: 1, timestamp }) !== null;
}
