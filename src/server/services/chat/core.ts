import { db } from "@/lib/db";
import {
  AppError,
  audit,
  decrypt,
  encrypt,
  guard,
  permitted,
  rateLimit,
  session,
} from "@/lib/security";
import type { ChatConversation, Prisma } from "@prisma/client";
export {
  db,
  AppError,
  audit,
  decrypt,
  encrypt,
  guard,
  permitted,
  rateLimit,
  session,
};
export async function configuration() {
  return db.chatConfiguration.findUniqueOrThrow({ where: { id: "default" } });
}
export async function publicReady() {
  const c = await configuration();
  if (
    process.env.CHAT_ENABLED !== "true" ||
    !c.enabled ||
    !c.noticeVersion ||
    !c.noticeText ||
    !c.retentionDays ||
    !c.policyApprovedAt
  )
    throw new AppError(503, "ขณะนี้ยังไม่เปิดบริการแชต");
  return c;
}
export async function staff(permission: string) {
  const s = (await guard(permission))!;
  await rateLimit("chat-staff:" + s.user!.id, 180, 60);
  const agents = await db.chatAgent.findMany({
    where: { userId: s.user!.id, active: true, department: { active: true } },
    select: { id: true, departmentId: true },
  });
  return { ...s, agents };
}
export function departmentAccess(
  agents: { departmentId: string }[],
  id: string,
) {
  if (!agents.some((a) => a.departmentId === id))
    throw new AppError(403, "ไม่มีสิทธิ์แชตหน่วยงานนี้");
}
export async function owned(id: string) {
  const s = (await session())!;
  if (!s) throw new AppError(401, "เซสชันหมดอายุ กรุณาเริ่มใหม่");
  await rateLimit("chat-read:" + s.id, 180, 60);
  const row = await db.chatConversation.findFirst({
    where: {
      id,
      ownerSessionId: s.id,
      deletedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!row) throw new AppError(404, "ไม่พบบทสนทนาในเซสชันนี้");
  return { s, row };
}
export async function lock(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM ChatConversation WHERE id=${id} FOR UPDATE`;
  return tx.chatConversation.findUniqueOrThrow({ where: { id } });
}
export async function append(
  tx: Prisma.TransactionClient,
  id: string,
  authorType: string,
  body: string,
  clientId: string,
  authorId?: string,
) {
  const c = await tx.chatConversation.findUniqueOrThrow({ where: { id } });
  if (c.lastSequence >= 400)
    throw new AppError(409, "ถึงขีดจำกัดข้อความ กรุณาจบบทสนทนา");
  await tx.chatConversation.update({
    where: { id },
    data: { lastSequence: { increment: 1 } },
  });
  return tx.chatMessage.create({
    data: {
      conversationId: id,
      sequence: c.lastSequence + 1,
      clientId,
      authorType,
      bodyEncrypted: encrypt(body),
      authorId,
    },
  });
}
export async function handoff(
  tx: Prisma.TransactionClient,
  row: ChatConversation,
  reason: string,
  actorId: string,
) {
  if (["queued", "active", "closed"].includes(row.status)) return row;
  const cfg = await tx.chatConfiguration.findUniqueOrThrow({
    where: { id: "default" },
  });
  const next = await tx.chatConversation.update({
    where: { id: row.id },
    data: {
      status: cfg.handoffEnabled ? "queued" : "resolved",
      queuedAt: cfg.handoffEnabled ? new Date() : null,
      resolvedAt: cfg.handoffEnabled ? null : new Date(),
      handoffReason: reason,
      aiPending: false,
      generation: { increment: 1 },
    },
  });
  await append(
    tx,
    row.id,
    "system",
    !cfg.handoffEnabled && reason !== "emergency"
      ? "ขณะนี้ไม่เปิดรับแชตเจ้าหน้าที่ กรุณาติดต่อผ่านช่องทางทางการของโรงพยาบาล"
      : reason === "emergency"
        ? "หากมีเหตุฉุกเฉิน กรุณาโทร 1669 หรือเข้ารับการดูแลฉุกเฉินทันที ไม่ควรรอแชต"
        : "ส่งคำขอให้เจ้าหน้าที่แล้ว กรุณาอย่าส่งข้อมูลระบุตัวบุคคลหรือข้อมูลสุขภาพที่ไม่จำเป็น",
    "handoff:" + next.generation,
  );
  await audit(tx, actorId, "chat.handoff", row.id, {
    reason,
    departmentId: row.departmentId,
  });
  return next;
}
export async function readMessages(
  row: ChatConversation,
  after: number,
  internal = false,
  client: Prisma.TransactionClient = db,
) {
  const messages = await client.chatMessage.findMany({
    where: {
      conversationId: row.id,
      sequence: { gt: after },
      ...(internal ? {} : { authorType: { not: "note" } }),
    },
    include: {
      citations: {
        include: {
          version: { select: { id: true, question: true, version: true } },
        },
      },
    },
    orderBy: { sequence: "asc" },
    take: 100,
  });
  return messages.map((m) => ({
    id: m.id,
    sequence: m.sequence,
    authorType: m.authorType,
    text: decrypt<string>(m.bodyEncrypted),
    createdAt: m.createdAt,
    citations: m.citations.map((c) => ({
      id: c.version.id,
      title: c.version.question,
      version: c.version.version,
      href: "/chat/source?id=" + c.version.id,
    })),
  }));
}
export async function publicState(row: ChatConversation, after = 0) {
  if (
    row.aiPending &&
    row.pendingSince &&
    row.pendingSince.getTime() < Date.now() - 30000
  ) {
    row = await db.$transaction(async (tx) => {
      const fresh = await lock(tx, row.id);
      return fresh.aiPending
        ? handoff(tx, fresh, "provider_timeout", fresh.ownerSessionId)
        : fresh;
    });
  }
  const queuePosition =
    row.status === "queued"
      ? await db.chatConversation.count({
          where: {
            departmentId: row.departmentId,
            status: "queued",
            deletedAt: null,
            expiresAt: { gt: new Date() },
            queuedAt: { lte: row.queuedAt ?? new Date() },
          },
        })
      : 0;
  return {
    id: row.id,
    status: row.status,
    departmentId: row.departmentId,
    typing: row.aiPending || (row.status === "active" && !!row.staffTypingUntil && row.staffTypingUntil > new Date()),
    queuePosition,
    messages: await readMessages(row, after),
    lastSequence: row.lastSequence,
  };
}
