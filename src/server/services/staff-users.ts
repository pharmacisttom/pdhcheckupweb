import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, audit, guard, hash, rateLimit, token } from "@/lib/security";
import { validOperatorTotp } from "@/lib/mfa";
import { decrypt } from "@/lib/security";
import { staffRoles } from "@/lib/staff-roles";
import { staffPassword } from "./enrollment";
import type { Prisma } from "@prisma/client";
const verification = z.object({
  password: z.string().min(1).max(128),
  mfa: z.string().regex(/^\d{6}$/),
});
export const createStaffInput = z
  .object({
    email: z
      .email()
      .max(191)
      .transform((v) => v.toLowerCase()),
    name: z.string().trim().min(1).max(160),
    role: z.enum(staffRoles),
    temporaryPassword: staffPassword.optional(),
    verification,
  })
  .strict();
export const editStaffInput = z
  .object({
    id: z.string().min(1).max(191),
    email: z
      .email()
      .max(191)
      .transform((v) => v.toLowerCase()),
    name: z.string().trim().min(1).max(160),
    role: z.enum(staffRoles),
    active: z.boolean(),
    forcePasswordChange: z.boolean().optional(),
    verification,
  })
  .strict();
export const staffActionInput = z
  .object({
    id: z.string().min(1).max(191),
    action: z.enum(["revoke-sessions", "reset-mfa", "invite"]),
    reason: z.string().trim().min(8).max(500),
    verification,
  })
  .strict();
const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  activationRequired: true,
  mustChangePassword: true,
  createdAt: true,
} as const;
export async function listStaff(search = "", page = 1) {
  await guard("users:manage");
  const where = search
    ? {
        OR: [
          { name: { contains: search.slice(0, 100) } },
          { email: { contains: search.slice(0, 100) } },
        ],
      }
    : {};
  const [users, total] = await db.$transaction([
    db.user.findMany({
      where,
      select: {
        ...publicUser,
        mfaSecret: true,
        _count: {
          select: { sessions: { where: { expiresAt: { gt: new Date() } } } },
        },
        invitations: {
          where: { consumedAt: null, expiresAt: { gt: new Date() } },
          select: { expiresAt: true },
          take: 1,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 25,
    }),
    db.user.count({ where }),
  ]);
  return {
    users: users.map(({ mfaSecret, _count, invitations, ...user }) => ({
      ...user,
      mfaEnrolled: !!mfaSecret,
      activeSessions: _count.sessions,
      invitationExpiresAt: invitations[0]?.expiresAt ?? null,
    })),
    total,
    page,
    roles: staffRoles,
  };
}
async function administrative<T>(
  proof: z.infer<typeof verification>,
  action: (
    tx: Prisma.TransactionClient,
    actorId: string,
    actorRole: string,
  ) => Promise<T>,
) {
  const identity = (await guard("users:manage"))!;
  await rateLimit("user-admin:" + identity.user!.id, 20, 900);
  if (
    !identity.user!.mfaSecret ||
    !validOperatorTotp(decrypt<string>(identity.user!.mfaSecret), proof.mfa) ||
    !(await bcrypt.compare(proof.password, identity.user!.passwordHash))
  )
    throw new AppError(403, "กรุณายืนยันรหัสผ่านและ MFA ของผู้ดูแล");
  return db.$transaction(
    async (tx) => {
      // Serialize privileged-account edits and preserve a consistent actor/target lock order.
      await tx.$queryRaw`SELECT id FROM User WHERE role = 'superadmin' ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${identity.user!.id} FOR UPDATE`;
      const actor = await tx.user.findUniqueOrThrow({
        where: { id: identity.user!.id },
      });
      const live = await tx.session.findUnique({ where: { id: identity.id } });
      if (
        !actor.active ||
        actor.activationRequired ||
        actor.mustChangePassword ||
        !live ||
        live.stage !== "full" ||
        live.expiresAt <= new Date() ||
        actor.passwordHash !== identity.user!.passwordHash ||
        actor.mfaSecret !== identity.user!.mfaSecret ||
        !["manager", "superadmin"].includes(actor.role)
      )
        throw new AppError(
          401,
          "สิทธิ์หรือข้อมูลบัญชีเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่",
        );
      return action(tx, actor.id, actor.role);
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}
function mayManage(
  actorRole: string,
  targetRole: string,
  nextRole = targetRole,
) {
  if (
    actorRole !== "superadmin" &&
    (targetRole === "superadmin" || nextRole === "superadmin")
  )
    throw new AppError(403, "เฉพาะ Superadmin จัดการบัญชี Superadmin ได้");
}
async function invitation(
  tx: Prisma.TransactionClient,
  userId: string,
  actorId: string,
) {
  const raw = token();
  const origin = process.env.APP_URL;
  if (!origin) throw new AppError(503, "ยังไม่ได้ตั้งค่าที่อยู่ระบบ");
  const link = new URL("/auth/activate", origin);
  link.hash = raw;
  await tx.userInvitation.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const row = await tx.userInvitation.create({
    data: {
      userId,
      tokenHash: hash(raw),
      createdBy: actorId,
      expiresAt: new Date(Date.now() + 24 * 3600000),
    },
  });
  return { activationUrl: link.toString(), expiresAt: row.expiresAt };
}
export async function createStaff(raw: z.input<typeof createStaffInput>) {
  const input = createStaffInput.parse(raw);
  // Random non-delivered password for invitation-only accounts; never use a shared default.
  const passwordHash = await bcrypt.hash(
    input.temporaryPassword ?? token(),
    12,
  );
  return administrative(input.verification, async (tx, actorId, role) => {
    mayManage(role, input.role);
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash,
        activationRequired: !input.temporaryPassword,
        mustChangePassword: true,
      },
      select: publicUser,
    });
    const invite = input.temporaryPassword
      ? null
      : await invitation(tx, user.id, actorId);
    await audit(tx, actorId, "users.created", user.id, {
      role: input.role,
      invitation: !!invite,
    });
    return { user, invitation: invite };
  });
}
export async function editStaff(raw: z.input<typeof editStaffInput>) {
  const input = editStaffInput.parse(raw);
  return administrative(input.verification, async (tx, actorId, role) => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${input.id} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: input.id } });
    if (!user) throw new AppError(404, "ไม่พบบัญชี");
    mayManage(role, user.role, input.role);
    if (
      user.id === actorId &&
      (!input.active || input.role !== role || input.forcePasswordChange)
    )
      throw new AppError(409, "ไม่สามารถระงับหรือลดสิทธิ์บัญชีตนเอง");
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        active: input.active,
        ...(input.forcePasswordChange ? { mustChangePassword: true } : {}),
      },
      select: publicUser,
    });
    // Revoke on any administrative change; never let stale role/identity sessions survive.
    await tx.session.deleteMany({ where: { userId: user.id } });
    if (!input.active || input.email !== user.email || input.role !== user.role)
      await tx.userInvitation.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    await audit(tx, actorId, "users.updated", user.id, {
      previousRole: user.role,
      role: input.role,
      active: input.active,
      forcePasswordChange: !!input.forcePasswordChange,
    });
    return { user: updated, reauthenticate: user.id === actorId };
  });
}
export async function staffAction(raw: z.input<typeof staffActionInput>) {
  const input = staffActionInput.parse(raw);
  return administrative(input.verification, async (tx, actorId, role) => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${input.id} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: input.id } });
    if (!user) throw new AppError(404, "ไม่พบบัญชี");
    mayManage(role, user.role);
    if (input.action === "reset-mfa") {
      if (user.id === actorId)
        throw new AppError(409, "ให้ผู้ดูแลอีกคนตรวจสอบและรีเซ็ต MFA");
      await tx.user.update({
        where: { id: user.id },
        data: { mfaSecret: null, mustChangePassword: true },
      });
    }
    let invite = null;
    if (input.action === "invite") {
      if (!user.active || !user.activationRequired || user.mfaSecret)
        throw new AppError(409, "ออกคำเชิญใหม่ได้เฉพาะบัญชีที่รอเปิดใช้งาน");
      invite = await invitation(tx, user.id, actorId);
    }
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(tx, actorId, "users." + input.action, user.id, {
      reason: input.reason,
    });
    return {
      ok: true,
      invitation: invite,
      reauthenticate: user.id === actorId,
    };
  });
}
