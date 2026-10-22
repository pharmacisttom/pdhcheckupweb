import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { TOTP, Secret } from 'otpauth';
import fs from 'node:fs';
import { encrypt } from '../src/lib/security';
const db = new PrismaClient();
async function main() {
  const email = process.env.OPERATOR_EMAIL?.toLowerCase(); const password = process.env.OPERATOR_PASSWORD; const role = process.env.OPERATOR_ROLE;
  const path = process.env.MFA_ENROLLMENT_FILE;
  if (!path) throw new Error('Set MFA_ENROLLMENT_FILE to a protected non-public file before executing.');
  if (!email || !password || password.length < 14 || !role || !['registration','manager','laboratory','finance','clinician','dpo','auditor','coordinator','superadmin'].includes(role)) throw new Error('Set OPERATOR_EMAIL, OPERATOR_PASSWORD (>=14 chars), OPERATOR_ROLE in a protected environment.');
  const secret = new Secret({ size: 20 });
  const user = await db.user.upsert({ where: { email }, create: { email, name: process.env.OPERATOR_NAME ?? email, role, passwordHash: await bcrypt.hash(password, 12), mfaSecret: encrypt(secret.base32) }, update: { role, passwordHash: await bcrypt.hash(password, 12), mfaSecret: encrypt(secret.base32) } });
  await db.session.deleteMany({ where: { userId: user.id } });
  // This is an explicit operator-only CLI, never a web response or application log.
  const totp = new TOTP({ issuer: 'PDH Smart Health Check', label: email, secret });
  fs.writeFileSync(path, totp.toString(), { mode: 0o600 });
  console.log('Operator configured; sessions revoked. Transfer the protected enrollment file through the approved enrollment workflow and delete it afterward.');
}
main().finally(() => db.$disconnect());
