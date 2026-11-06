import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encrypt, privateHash } from "../../src/lib/security";
import { operatorTotp } from "../../src/lib/mfa";
export async function syntheticStaff(role = "superadmin") {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !["/pdh_healthcheck", "/pdh_healthcheck_test"].includes(url.pathname) ||
    process.env.SEED_DEMO !== "true"
  )
    throw Error("Synthetic localhost development database required");
  const db = new PrismaClient();
  const email = crypto.randomUUID() + "@browser-staff.invalid";
  const password = "Browser-only-" + crypto.randomUUID();
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const user = await db.user.create({
    data: {
      email,
      name: "Synthetic browser staff",
      role,
      passwordHash: await bcrypt.hash(password, 12),
      mfaSecret: encrypt(secret),
    },
  });
  return {
    ...user,
    password,
    mfa: () => operatorTotp(secret).generate(),
    async cleanup(extraIds: string[] = []) {
      const ids = [user.id, ...extraIds];
      await db.mfaRecoveryCode.deleteMany({ where: { userId: { in: ids } } });
      await db.staffPasswordReset.deleteMany({
        where: { userId: { in: ids } },
      });
      await db.userInvitation.deleteMany({ where: { userId: { in: ids } } });
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.audit.deleteMany({
        where: { OR: [{ actorId: { in: ids } }, { resourceId: { in: ids } }] },
      });
      await db.rateLimit.deleteMany({
        where: {
          OR: [
            { key: { contains: privateHash(email) } },
            ...ids.map((id) => ({ key: { contains: id } })),
          ],
        },
      });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.$disconnect();
    },
  };
}
