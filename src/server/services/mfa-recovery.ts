import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { hash } from "@/lib/security";
export function recoveryHash(code: string) {
  const clean = code.replace(/-/g, "").toUpperCase();
  return /^[A-F0-9]{32}$/.test(clean) ? hash(clean) : null;
}
export async function replaceRecoveryCodes(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const codes = Array.from({ length: 10 }, () =>
    randomBytes(16).toString("hex").toUpperCase().match(/.{8}/g)!.join("-"),
  );
  await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
  await tx.mfaRecoveryCode.createMany({
    data: codes.map((code) => ({ userId, codeHash: recoveryHash(code)! })),
  });
  return codes;
}
export async function consumeRecoveryCode(
  tx: Prisma.TransactionClient,
  userId: string,
  code: string,
) {
  const codeHash = recoveryHash(code);
  if (!codeHash) return false;
  const result = await tx.mfaRecoveryCode.updateMany({
    where: { userId, codeHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count === 1;
}
