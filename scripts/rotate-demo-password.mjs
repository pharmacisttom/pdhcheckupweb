import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
loadEnvFile('.env');
if (process.env.SEED_DEMO !== 'true' || process.env.NODE_ENV === 'production') throw new Error('Development demo only');
const db = new PrismaClient();
try {
  const password = randomBytes(32).toString('hex');
  await db.user.update({ where: { email: process.env.SEED_ADMIN_EMAIL }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  const source = fs.readFileSync('.env','utf8');
  fs.writeFileSync('.env', source.replace(/^SEED_ADMIN_PASSWORD=.*$/m, 'SEED_ADMIN_PASSWORD="' + password + '"'));
  console.log('Development operator password rotated. Read it locally from the ignored .env only.');
} finally { await db.$disconnect(); }
