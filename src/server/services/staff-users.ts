import { staffNotice, staffTokenLink, sendStaffEmail } from "./staff-email";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, audit, guard, hash, rateLimit, token } from "@/lib/security";
import { validOperatorTotp } from "@/lib/mfa";
import { decrypt, encrypt } from "@/lib/security";
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
    department: z.string().trim().max(160).optional(),
    position: z.string().trim().max(160).optional(),
    invitationExpiresAt: z.iso.datetime().optional(),
    invitationNote: z.string().trim().max(1000).optional(),
    sendEmail: z.boolean().optional(),
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
    department: z.string().trim().max(160).optional(),
    position: z.string().trim().max(160).optional(),
    forcePasswordChange: z.boolean().optional(),
    verification,
  })
  .strict();
export const staffActionInput = z
  .object({
    id: z.string().min(1).max(191),
    action: z.enum([
      "revoke-sessions",
      "reset-mfa",
      "invite",
      "revoke-invitation",
    ]),
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
  department: true,
  position: true,
  activationRequired: true,
  mustChangePassword: true,
  createdAt: true,
} as const;
export async function listStaff(
  search = "",
  page = 1,
  filters: { department?: string; role?: string; status?: string } = {},
) {
  const reader = await guard("users:manage");
  await rateLimit("staff-list:" + reader!.user!.id, 120, 60);
  const searchWhere = search
    ? {
        OR: [
          { name: { contains: search.slice(0, 100) } },
          { email: { contains: search.slice(0, 100) } },
        ],
      }
    : {};
  const where: Prisma.UserWhereInput = {
    ...searchWhere,
    ...(filters.department ? { department: filters.department } : {}),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.status === "suspended"
      ? { active: false }
      : filters.status === "pending"
        ? {
            active: true,
            OR: [
              { activationRequired: true },
              { mustChangePassword: true },
              { mfaSecret: null },
            ],
            AND: searchWhere,
          }
        : filters.status === "active"
          ? {
              active: true,
              activationRequired: false,
              mustChangePassword: false,
              mfaSecret: { not: null },
            }
          : {}),
  };
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
          where: {
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
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
  options: { expiresAt?: string; note?: string } = {},
) {
  const raw = token();
  const link = staffTokenLink("/invite", raw);
  const expiresAt = options.expiresAt
    ? new Date(options.expiresAt)
    : new Date(Date.now() + 24 * 3600000);
  if (
    expiresAt <= new Date() ||
    expiresAt > new Date(Date.now() + 7 * 24 * 3600000)
  )
    throw new AppError(422, "อายุคำเชิญต้องอยู่ภายใน 7 วัน");
  await tx.userInvitation.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date(), revokedAt: new Date(), status: "revoked" },
  });
  const row = await tx.userInvitation.create({
    data: {
      userId,
      tokenHash: hash(raw),
      createdBy: actorId,
      expiresAt,
      noteEncrypted: options.note ? encrypt(options.note) : null,
    },
  });
  await audit(tx, actorId, "invitation.created", userId, {
    invitationId: row.id,
  });
  return { id: row.id, activationUrl: link, expiresAt: row.expiresAt };
}
export async function createStaff(raw: z.input<typeof createStaffInput>) {
  const input = createStaffInput.parse(raw);
  await guard("users:manage");
  // Random non-delivered password for invitation-only accounts; never use a shared default.
  const passwordHash = await bcrypt.hash(
    input.temporaryPassword ?? token(),
    12,
  );
  if (await db.user.findUnique({ where: { email: input.email } }))
    throw new AppError(409, "มีบัญชีอีเมลนี้แล้ว กรุณาใช้กระบวนการบัญชีเดิม");
  const result = await administrative(
    input.verification,
    async (tx, actorId, role) => {
      mayManage(role, input.role);
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          department: input.department,
          position: input.position,
          role: input.role,
          passwordHash,
          activationRequired: !input.temporaryPassword,
          mustChangePassword: true,
        },
        select: publicUser,
      });
      const invite = input.temporaryPassword
        ? null
        : await invitation(tx, user.id, actorId, {
            expiresAt: input.invitationExpiresAt,
            note: input.invitationNote,
          });
      await audit(tx, actorId, "users.created", user.id, {
        role: input.role,
        invitation: !!invite,
      });
      return { user, invitation: invite };
    },
  );
  const deliveryStatus =
    result.invitation && input.sendEmail !== false
      ? await deliverInvitation(
          result.invitation.id,
          result.invitation.activationUrl,
          "invitation",
        )
      : "not_requested";
  return { ...result, deliveryStatus };
}
export async function editStaff(raw: z.input<typeof editStaffInput>) {
  const input = editStaffInput.parse(raw);
  const result = await administrative(
    input.verification,
    async (tx, actorId, role) => {
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
          department: input.department,
          position: input.position,
          role: input.role,
          active: input.active,
          ...(input.forcePasswordChange ? { mustChangePassword: true } : {}),
        },
        select: publicUser,
      });
      // Revoke on any administrative change; never let stale role/identity sessions survive.
      await tx.staffPasswordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      if (
        !input.active ||
        input.email !== user.email ||
        input.role !== user.role
      )
        await tx.userInvitation.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: {
            consumedAt: new Date(),
            revokedAt: new Date(),
            status: "revoked",
          },
        });
      await audit(tx, actorId, "users.updated", user.id, {
        previousRole: user.role,
        role: input.role,
        active: input.active,
        forcePasswordChange: !!input.forcePasswordChange,
      });
      if (!input.active) await audit(tx, actorId, "users.disabled", user.id);
      if (input.role !== user.role)
        await audit(tx, actorId, "users.role_changed", user.id, {
          role: input.role,
        });
      return { user: updated, reauthenticate: user.id === actorId };
    },
  );
  if (!input.active)
    await staffNotice(
      result.user,
      "suspended",
      result.user.id + ":" + Date.now(),
    );
  return result;
}
export async function staffAction(raw: z.input<typeof staffActionInput>) {
  const input = staffActionInput.parse(raw);
  const result = await administrative(
    input.verification,
    async (tx, actorId, role) => {
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
      if (input.action === "revoke-invitation") {
        await tx.userInvitation.updateMany({
          where: { userId: user.id, consumedAt: null, revokedAt: null },
          data: { revokedAt: new Date(), status: "revoked" },
        });
      }
      if (input.action === "reset-mfa") {
        await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
        await audit(tx, actorId, "auth.mfa_recovery_requested", user.id, {
          reason: input.reason,
        });
      }
      let invite = null;
      if (input.action === "invite") {
        if (!user.active || !user.activationRequired || user.mfaSecret)
          throw new AppError(409, "ออกคำเชิญใหม่ได้เฉพาะบัญชีที่รอเปิดใช้งาน");
        const previous = await tx.userInvitation.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });
        invite = await invitation(tx, user.id, actorId, {
          note: previous?.noteEncrypted
            ? decrypt<string>(previous.noteEncrypted)
            : undefined,
        });
      }
      await tx.staffPasswordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      if (input.action === "invite" || input.action === "revoke-invitation")
        await audit(
          tx,
          actorId,
          input.action === "invite"
            ? "invitation.resent"
            : "invitation.revoked",
          user.id,
        );
      await audit(tx, actorId, "users." + input.action, user.id, {
        reason: input.reason,
      });
      return {
        ok: true,
        invitation: invite,
        reauthenticate: user.id === actorId,
      };
    },
  );
  const deliveryStatus = result.invitation
    ? await deliverInvitation(
        result.invitation.id,
        result.invitation.activationUrl,
        "resend",
      )
    : undefined;
  return { ...result, deliveryStatus };
}

export async function deliverInvitation(
  id: string,
  link: string,
  kind: "invitation" | "resend",
) {
  const row = await db.userInvitation.findUniqueOrThrow({
    where: { id },
    include: { user: true },
  });
  if (row.revokedAt || row.consumedAt || row.expiresAt <= new Date())
    return "failed";
  const status = await sendStaffEmail({
    to: row.user.email,
    name: row.user.name,
    kind,
    key: row.id,
    link,
    note: row.noteEncrypted ? decrypt<string>(row.noteEncrypted) : undefined,
    expiresAt: row.expiresAt,
  });
  await db.$transaction(async (tx) => {
    await tx.userInvitation.update({
      where: { id },
      data: {
        deliveryStatus: status,
        deliveryAttempts: { increment: 1 },
        deliveryUpdatedAt: new Date(),
        ...(status === "sent" ? { sentAt: new Date() } : {}),
      },
    });
    await audit(tx, row.createdBy, "invitation.email_" + status, row.userId, {
      invitationId: id,
    });
  });
  return status;
}
export async function listInvitations(userId?: string) {
  const reader = await guard("users:manage");
  await rateLimit("invitation-list:" + reader!.user!.id, 120, 60);
  const rows = await db.userInvitation.findMany({
    where: userId ? { userId } : {},
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    user: r.user,
    invitedBy: r.createdBy,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    acceptedAt: r.revokedAt || r.status !== "accepted" ? null : r.consumedAt,
    revokedAt: r.revokedAt,
    status: r.revokedAt
      ? "revoked"
      : r.status === "legacy_consumed"
        ? "legacy_consumed"
        : r.consumedAt
          ? r.status === "accepted"
            ? "accepted"
            : "legacy_consumed"
          : r.expiresAt <= new Date()
            ? "expired"
            : "pending",
    deliveryStatus: r.deliveryStatus,
    deliveryAttempts: r.deliveryAttempts,
    sentAt: r.sentAt,
  }));
}
export async function verifyInvitation(rawToken: string) {
  await rateLimit("invite-verify:global", 100, 900);
  await rateLimit("invite-verify:" + hash(rawToken), 10, 600);
  const row = await db.userInvitation.findUnique({
    where: { tokenHash: hash(rawToken) },
    include: { user: true },
  });
  if (
    !row ||
    row.revokedAt ||
    row.status !== "pending" ||
    row.consumedAt ||
    row.expiresAt <= new Date() ||
    !row.user.active ||
    !row.user.activationRequired
  )
    throw new AppError(422, "คำเชิญไม่ถูกต้องหรือหมดอายุ");
  return {
    name: row.user.name,
    department: row.user.department,
    role: row.user.role,
    email: row.user.email.replace(/^(.).*(@.+)$/, "$1***$2"),
    expiresAt: row.expiresAt,
  };
}
export async function expireInvitations() {
  const rows = await db.userInvitation.findMany({
    where: {
      status: "pending",
      consumedAt: null,
      revokedAt: null,
      expiresAt: { lte: new Date() },
    },
    include: { user: true },
    take: 100,
  });
  let processed = 0;
  for (const r of rows) {
    const correlationId = crypto.randomUUID();
    const changed = await db.$transaction(async (tx) => {
      const result = await tx.userInvitation.updateMany({
        where: {
          id: r.id,
          status: "pending",
          consumedAt: null,
          revokedAt: null,
        },
        data: { status: "expired" },
      });
      if (result.count)
        await audit(
          tx,
          "staff-invitation-worker",
          "invitation.expired",
          r.userId,
          { invitationId: r.id },
          correlationId,
        );
      return result;
    });
    if (changed.count) {
      processed++;
      await staffNotice(
        r.user,
        "expired",
        r.id + ":expired",
        undefined,
        undefined,
        { actorId: "staff-invitation-worker", correlationId },
      );
    }
  }
  return { processed };
}
