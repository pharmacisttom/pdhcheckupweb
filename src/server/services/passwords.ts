import { staffPassword } from "./enrollment";
import { staffNotice } from "./staff-email";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, audit } from "@/lib/security";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: staffPassword,
    confirmPassword: z.string(),
  })
  .superRefine((input, ctx) => {
    if (input.newPassword !== input.confirmPassword)
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "ยืนยันรหัสผ่านใหม่ไม่ตรงกัน",
      });
    if (input.currentPassword === input.newPassword)
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านเดิม",
      });
  });

export async function changePassword(
  sessionId: string,
  raw: z.input<typeof changePasswordSchema>,
) {
  const input = changePasswordSchema.parse(raw);
  const identity = await db.session.findUnique({ where: { id: sessionId } });
  if (!identity?.userId) throw new AppError(401, "กรุณาเข้าสู่ระบบเจ้าหน้าที่");
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${identity.userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: identity.userId! },
      });
      const liveSession = await tx.session.findUnique({
        where: { id: sessionId },
      });
      if (
        !user?.active ||
        !liveSession ||
        liveSession.stage !== "full" ||
        user.activationRequired ||
        user.mustChangePassword ||
        liveSession.expiresAt <= new Date()
      )
        throw new AppError(401, "กรุณาเข้าสู่ระบบใหม่");
      if (!(await bcrypt.compare(input.currentPassword, user.passwordHash)))
        throw new AppError(422, "รหัสผ่านเดิมไม่ถูกต้อง");
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.staffPasswordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await audit(tx, user.id, "auth.password_changed", user.id);
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
  const user = await db.user.findUniqueOrThrow({
    where: { id: identity.userId },
  });
  await staffNotice(user, "password_changed", user.id + ":" + Date.now());
  return { ok: true };
}
