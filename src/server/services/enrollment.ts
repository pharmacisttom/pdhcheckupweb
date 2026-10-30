import { replaceRecoveryCodes } from "./mfa-recovery";
import { staffNotice } from "./staff-email";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Secret } from "otpauth";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import {
  AppError,
  audit,
  createSession,
  decrypt,
  encrypt,
  hash,
  identitySession,
  rateLimit,
} from "@/lib/security";
import { operatorTotp, validOperatorTotp } from "@/lib/mfa";
import { staffLanding } from "@/lib/staff-roles";
import type { Prisma, User, Session } from "@prisma/client";
export const staffPassword = z
  .string()
  .min(14)
  .max(128)
  .refine(
    (v) =>
      ![
        "passwordpassword",
        "12345678901234",
        "qwertyqwertyqwerty",
        "administrator123",
        "letmeinletmein",
      ].includes(v.toLowerCase()),
    "กรุณาใช้ passphrase ที่คาดเดายาก",
  )
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "รหัสผ่านยาวได้ไม่เกิน 72 ไบต์",
  );
export const newPasswordInput = z
  .object({ newPassword: staffPassword, confirmPassword: z.string().max(128) })
  .refine(
    (v) => v.newPassword === v.confirmPassword,
    "รหัสผ่านยืนยันไม่ตรงกัน",
  );
export const firstPasswordInput = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: staffPassword,
    confirmPassword: z.string().max(128),
  })
  .refine(
    (v) =>
      v.newPassword === v.confirmPassword &&
      v.newPassword !== v.currentPassword,
    "โปรดยืนยันรหัสผ่านใหม่ที่แตกต่างจากรหัสผ่านเดิม",
  );
export function onboardingNext(
  user: Pick<
    User,
    "activationRequired" | "mustChangePassword" | "mfaSecret" | "role"
  >,
) {
  if (user.activationRequired) return "/auth/activate";
  if (user.mustChangePassword) return "/auth/password";
  if (!user.mfaSecret) return "/auth/mfa/setup";
  return staffLanding(user.role);
}
export async function onboardingIdentity() {
  const s = await identitySession();
  if (
    !s?.user ||
    !["password", "mfa"].includes(s.stage) ||
    s.user.activationRequired
  )
    throw new AppError(401, "กรุณาเข้าสู่ระบบใหม่");
  return s as Session & { user: User };
}
async function lockedOnboarding(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
) {
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const current = await tx.session.findUnique({ where: { id } });
  if (
    !user.active ||
    user.activationRequired ||
    !current ||
    current.expiresAt <= new Date() ||
    !["password", "mfa"].includes(current.stage)
  )
    throw new AppError(401, "กรุณาเข้าสู่ระบบใหม่");
  return { user, current };
}
export async function finishFirstPassword(
  raw: z.input<typeof firstPasswordInput>,
) {
  const input = firstPasswordInput.parse(raw);
  const s = await onboardingIdentity();
  await rateLimit("onboard-password:" + s.user.id, 5, 900);
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const result = await db.$transaction(
    async (tx) => {
      const { user, current } = await lockedOnboarding(tx, s.id, s.user.id);
      if (current.stage !== "password" || !user.mustChangePassword)
        throw new AppError(409, "ขั้นตอนการตั้งค่าบัญชีเปลี่ยนแปลงแล้ว");
      if (!(await bcrypt.compare(input.currentPassword, user.passwordHash)))
        throw new AppError(422, "รหัสผ่านเดิมไม่ถูกต้อง");
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.staffPasswordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await createSession(user.id, tx, user.mfaSecret ? "full" : "mfa");
      await audit(tx, user.id, "auth.first_password_changed", user.id);
      return {
        next: user.mfaSecret ? staffLanding(user.role) : "/auth/mfa/setup",
      };
    },
    { timeout: 15000 },
  );
  await staffNotice(s.user, "password_changed", s.user.id + ":" + Date.now());
  return result;
}
export async function beginMfa() {
  const s = await onboardingIdentity();
  await rateLimit("mfa-setup:" + s.user.id, 15, 600);
  const result = await db.$transaction(async (tx) => {
    const { user, current } = await lockedOnboarding(tx, s.id, s.user.id);
    if (current.stage !== "mfa" || user.mustChangePassword || user.mfaSecret)
      throw new AppError(403, "กรุณาเปลี่ยนรหัสผ่านก่อนตั้งค่า MFA");
    const secret = current.pendingMfaSecret
      ? decrypt<string>(current.pendingMfaSecret)
      : new Secret({ size: 20 }).base32;
    if (!current.pendingMfaSecret) {
      await tx.session.update({
        where: { id: s.id },
        data: { pendingMfaSecret: encrypt(secret) },
      });
      await audit(tx, user.id, "auth.mfa_enrollment_started", user.id);
    }
    return { secret, email: user.email, expiresAt: current.expiresAt };
  });
  // QR is generated in memory, never persisted, logged or sent to another service.
  const uri = operatorTotp(result.secret, result.email).toString();
  return {
    manualKey: result.secret,
    qrDataUrl: await QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      width: 256,
    }),
    expiresAt: result.expiresAt,
  };
}
export async function confirmMfa(code: string) {
  const s = await onboardingIdentity();
  await rateLimit("mfa-confirm:" + s.user.id, 5, 600);
  return db.$transaction(async (tx) => {
    const { user, current } = await lockedOnboarding(tx, s.id, s.user.id);
    if (
      current.stage !== "mfa" ||
      user.mustChangePassword ||
      user.mfaSecret ||
      !current.pendingMfaSecret
    )
      throw new AppError(409, "กรุณาเริ่มตั้งค่า MFA ใหม่");
    const secret = decrypt<string>(current.pendingMfaSecret);
    if (!validOperatorTotp(secret, code))
      throw new AppError(422, "รหัส MFA ไม่ถูกต้อง กรุณาตรวจสอบเวลาในอุปกรณ์");
    await tx.user.update({
      where: { id: user.id },
      data: { mfaSecret: encrypt(secret) },
    });
    await tx.staffPasswordReset.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await createSession(user.id, tx);
    await audit(tx, user.id, "auth.mfa_enrolled", user.id);
    const recoveryCodes = await replaceRecoveryCodes(tx, user.id);
    return { next: staffLanding(user.role), recoveryCodes };
  });
}
export const activationInput = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    newPassword: staffPassword,
    confirmPassword: z.string().max(128),
  })
  .refine(
    (v) => v.newPassword === v.confirmPassword,
    "รหัสผ่านยืนยันไม่ตรงกัน",
  );
export async function activateAccount(raw: z.input<typeof activationInput>) {
  const input = activationInput.parse(raw);
  await rateLimit("activation:global", 100, 900);
  await rateLimit("activation:" + hash(input.token), 5, 900);
  const invite = await db.userInvitation.findUnique({
    where: { tokenHash: hash(input.token) },
  });
  if (!invite) throw new AppError(422, "คำเชิญไม่ถูกต้องหรือหมดอายุ");
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${invite.userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: invite.userId },
      });
      const fresh = await tx.userInvitation.findUniqueOrThrow({
        where: { id: invite.id },
      });
      if (
        !user.active ||
        !user.activationRequired ||
        fresh.status !== "pending" ||
        fresh.consumedAt ||
        fresh.revokedAt ||
        fresh.expiresAt <= new Date()
      )
        throw new AppError(422, "คำเชิญไม่ถูกต้องหรือหมดอายุ");
      await tx.userInvitation.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date(), status: "accepted" },
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          activationRequired: false,
          mustChangePassword: false,
        },
      });
      await tx.staffPasswordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await createSession(user.id, tx, "mfa");
      await audit(tx, user.id, "invitation.accepted", user.id, {
        invitationId: invite.id,
      });
      await audit(tx, user.id, "auth.account_activated", user.id);
      return { next: "/auth/mfa/setup" };
    },
    { timeout: 15000 },
  );
  const activated = await db.user.findUniqueOrThrow({
    where: { id: invite.userId },
  });
  await staffNotice(activated, "activated", invite.id + ":activated");
  return result;
}
