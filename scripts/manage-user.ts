import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Secret } from 'otpauth';
import fs from 'node:fs';
import path from 'node:path';
import { encrypt } from '../src/lib/security';
import { operatorTotp } from '../src/lib/mfa';
const db = new PrismaClient();
async function main() {
  const email = process.env.OPERATOR_EMAIL?.trim().toLowerCase();
  const password = process.env.OPERATOR_PASSWORD;
  const role = process.env.OPERATOR_ROLE;
  const file = process.env.MFA_ENROLLMENT_FILE;
  if (!file || !path.isAbsolute(file) || /(^|[\\/])public([\\/]|$)/i.test(file)) throw new Error('Set MFA_ENROLLMENT_FILE to an absolute protected path outside public.');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password || password.length < 14 || Buffer.byteLength(password, 'utf8') > 72 || !role || !['registration','manager','laboratory','finance','clinician','dpo','auditor','coordinator','superadmin'].includes(role)) throw new Error('Set valid OPERATOR_EMAIL, OPERATOR_PASSWORD (14-72 UTF-8 bytes), OPERATOR_ROLE in a protected environment.');
  const relative = path.relative(path.resolve(__dirname, '..'), path.resolve(file));
  if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw new Error('Enrollment output must be outside the repository.');
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && process.env.OPERATOR_ROTATE_EXISTING !== 'true') throw new Error('Account exists; no changes made. Explicit OPERATOR_ROTATE_EXISTING=true is required to replace password, role and MFA and revoke sessions.');
  const secret = new Secret({ size: 20 });
  const passwordHash = await bcrypt.hash(password, 12);
  // Exclusive creation prevents overwriting an enrollment file or following a symlink.
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, operatorTotp(secret.base32, email).toString());
    await db.$transaction(async tx => {
      if (existing) {
        await tx.$queryRaw`SELECT id FROM User WHERE id = ${existing.id} FOR UPDATE`;
        const fresh = await tx.user.findUniqueOrThrow({ where: { id: existing.id } });
        if (fresh.passwordHash !== existing.passwordHash || fresh.mfaSecret !== existing.mfaSecret) throw new Error('Account changed concurrently; retry after review.');
        await tx.user.update({ where: { id: existing.id }, data: { role, passwordHash, mfaSecret: encrypt(secret.base32) } });
        await tx.session.deleteMany({ where: { userId: existing.id } });
      } else {
        await tx.user.create({ data: { email, name: process.env.OPERATOR_NAME ?? email, role, passwordHash, mfaSecret: encrypt(secret.base32) } });
      }
    });
  } catch {
    fs.unlinkSync(file);
    throw new Error('Operator setup failed; protected enrollment file removed. Review database availability and account state.');
  } finally { fs.closeSync(fd); }
  console.log('Operator configured. Enroll locally from the protected file, verify login, then delete enrollment artifacts.');
}
main().catch(() => { console.error('Operator setup refused or failed. Check protected inputs, file permissions, existing-account rotation authorization and database availability. No secrets are logged.'); process.exitCode = 1; }).finally(() => db.$disconnect());
