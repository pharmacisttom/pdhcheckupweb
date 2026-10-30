import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  AppError,
  audit,
  hash,
  privateHash,
  rateLimit,
  token,
} from "@/lib/security";
import { staffPassword } from "./enrollment";
import { staffNotice, staffTokenLink } from "./staff-email";
export const forgotStaffInput = z
  .object({
    email: z
      .email()
      .max(191)
      .transform((v) => v.toLowerCase()),
  })
  .strict();
export const resetStaffInput = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    newPassword: staffPassword,
    confirmPassword: z.string().max(128),
  })
  .strict()
  .refine(
    (v) => v.newPassword === v.confirmPassword,
    "รหัสผ่านยืนยันไม่ตรงกัน",
  );
export async function forgotStaffPassword(
  raw: z.input<typeof forgotStaffInput>,
  schedule?: (work: () => Promise<void>) => void,
) {
  const { email } = forgotStaffInput.parse(raw);
  await rateLimit("staff-reset:global", 100, 900);
  // Per-account throttling returns the same response for both known and unknown addresses.
  const response = {
    ok: true,
    message:
      "หากบัญชีสามารถกู้คืนได้ ระบบจะดำเนินการส่งลิงก์ตามช่องทางที่ตั้งค่าไว้ กรุณาติดต่อผู้ดูแลหากไม่ได้รับอีเมล",
  };
  try {
    await rateLimit("staff-reset:" + privateHash(email), 3, 900);
  } catch {
    return response;
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active || user.activationRequired || !user.mfaSecret)
    return response;
  try {
    const rawToken = token();
    const link = staffTokenLink("/reset-password", rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60000);
    const row = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id=${user.id} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      if (!current.active || current.activationRequired || !current.mfaSecret)
        return null;
      await tx.staffPasswordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      const row = await tx.staffPasswordReset.create({
        data: { userId: user.id, tokenHash: hash(rawToken), expiresAt },
      });
      await audit(tx, "anonymous", "auth.password_reset_requested", user.id, {
        authenticated: false,
        channel: "email",
      });
      return row;
    });
    if (row) {
      const deliver = async () => {
        try {
          await staffNotice(user, "password_reset", row.id, link, expiresAt);
        } catch {
          /* no secret-bearing provider errors */
        }
      };
      if (schedule) schedule(deliver);
      else await deliver();
    }
  } catch {
    /* delivery or configuration errors never reveal account existence */
  }
  return response;
}
export async function resetStaffPassword(raw: z.input<typeof resetStaffInput>) {
  const input = resetStaffInput.parse(raw);
  await rateLimit("staff-reset-token:" + hash(input.token), 5, 900);
  const request = await db.staffPasswordReset.findUnique({
    where: { tokenHash: hash(input.token) },
  });
  const fail = () =>
    new AppError(422, "ลิงก์ไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว");
  if (!request) throw fail();
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const user = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM User WHERE id=${request.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: request.userId },
    });
    const current = await tx.staffPasswordReset.findUniqueOrThrow({
      where: { id: request.id },
    });
    if (
      !user.active ||
      user.activationRequired ||
      !user.mfaSecret ||
      current.consumedAt ||
      current.expiresAt <= new Date()
    )
      throw fail();
    await tx.staffPasswordReset.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(tx, user.id, "auth.password_reset_completed", user.id);
    return user;
  });
  await staffNotice(user, "password_changed", request.id + ":changed");
  return { ok: true, next: "/login" };
}
