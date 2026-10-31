import { rescheduleBooking } from "./appointments";
import { availableSlots } from "./availability";
import { questionnaireSchema } from "./questionnaires";
import { staffRoles } from "@/lib/staff-roles";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  AppError,
  audit,
  decrypt,
  encrypt,
  guard,
  hash,
  permitted,
  rateLimit,
  session,
} from "@/lib/security";
import { activeStatuses, bangkokDate } from "@/lib/domain";
async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(422, "คำขอต้องเป็น JSON ที่ถูกต้อง");
  }
}
const id = z.string().min(1).max(191),
  revision = z.number().int().nonnegative();
const reason = z.string().trim().min(3).max(1500);
const money = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/);
const org = z
  .object({
    name: z.string().trim().min(1).max(255),
    contact: z.string().trim().min(1).max(1000),
    status: z.enum(["draft", "active", "inactive"]),
    revision,
    reason,
  })
  .strict();
const service = z
  .object({
    nameTh: z.string().trim().min(1).max(255),
    nameEn: z.string().trim().max(255),
    category: z.string().trim().min(1).max(80),
    unit: z.string().trim().min(1).max(40),
    active: z.boolean(),
    requiresReview: z.boolean(),
    preparation: z.string().trim().max(3000),
    revision,
    reason,
  })
  .strict();
const slot = z
  .object({
    capacity: z.number().int().min(1).max(500),
    reservedCapacity: z.number().int().min(0).max(500),
    closed: z.boolean(),
    revision,
    reason,
  })
  .strict();
const wait = z
  .object({
    status: z.enum([
      "waiting",
      "contacted",
      "scheduled",
      "closed",
      "cancelled",
    ]),
    assigneeId: id.nullable(),
    bookingReference: z.string().trim().max(40).optional(),
    revision,
    reason,
  })
  .strict();
const finance = z
  .object({
    action: z.enum(["approve", "bill", "payment", "refund", "void"]),
    amount: money,
    reference: z.string().trim().max(200),
    reason,
    revision,
    idempotencyKey: z.string().uuid(),
  })
  .strict();
const privacy = z
  .object({
    action: z.enum(["update", "verify_identity"]),
    status: z.enum([
      "pending_identity_review",
      "under_review",
      "awaiting_information",
      "processing",
      "completed",
      "rejected",
      "closed",
    ]),
    assigneeId: id.nullable(),
    confirmed: z.boolean().optional(),
    reason,
    revision,
  })
  .strict();
const permissions: Record<string, string> = {
  organizations: "organizations:write",
  services: "catalog:write",
  slots: "calendar:write",
  waitlist: "bookings:read",
  finance: "finance:read",
  privacy: "privacy:read",
};
function fresh(row: { revision: number }, expected: number) {
  if (row.revision !== expected)
    throw new AppError(
      409,
      "ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่ก่อนบันทึก",
      "STALE_REVISION",
    );
}
function found<T>(row: T | null): T {
  if (!row) throw new AppError(404, "ไม่พบข้อมูล");
  return row;
}
async function assignee(
  tx: Prisma.TransactionClient,
  userId: string | null,
  permission: string,
) {
  if (!userId) return;
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (
    !user?.active ||
    user.activationRequired ||
    user.mustChangePassword ||
    !user.mfaSecret ||
    !permitted(user.role, permission)
  )
    throw new AppError(
      422,
      "ผู้รับผิดชอบต้องเป็นบัญชีที่พร้อมใช้งานและมีสิทธิ์ตรงกับงาน",
    );
}
export async function adminCrud(
  req: Request,
  path: string,
): Promise<unknown | undefined> {
  if (path === "capabilities" && req.method === "GET") {
    const actor = await session();
    if (!actor?.user) throw new AppError(403, "เฉพาะเจ้าหน้าที่");
    return Object.fromEntries(
      [
        "packages:write",
        "packages:approve",
        "packages:read",
        "imports:write",
        "imports:approve",
        "calendar:write",
        "bookings:write",
      ].map((p) => [p, permitted(actor.user!.role, p)]),
    );
  }
  if (path === "manage/packages" && req.method === "GET") {
    const actor = (await guard("packages:read"))!;
    const url = new URL(req.url),
      page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(url.searchParams.get("page") ?? 1),
      q = z
        .string()
        .max(100)
        .parse(url.searchParams.get("q") ?? "");
    const where = q
      ? { OR: [{ key: { contains: q } }, { name: { contains: q } }] }
      : {};
    const [rows, total] = await db.$transaction([
      db.package.findMany({
        where,
        skip: (page - 1) * 25,
        take: 25,
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            include: { service: { select: { code: true, nameTh: true } } },
          },
        },
      }),
      db.package.count({ where }),
    ]);
    return {
      rows,
      total,
      page,
      capabilities: {
        "packages:write": permitted(actor.user!.role, "packages:write"),
        "packages:approve": permitted(actor.user!.role, "packages:approve"),
      },
    };
  }
  if (path === "imports/cancel" && req.method === "POST") {
    const actor = (await guard("imports:write").catch(() =>
      guard("imports:approve"),
    ))!;
    const { id: batchId, reason: note } = z
      .object({ id, reason })
      .strict()
      .parse(await readJson(req));
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ImportBatch WHERE id=${batchId} FOR UPDATE`;
      const row = found(
        await tx.importBatch.findUnique({ where: { id: batchId } }),
      );
      if (
        row.operatorId !== actor.user!.id &&
        !permitted(actor.user!.role, "imports:approve")
      )
        throw new AppError(403, "ยกเลิกได้เฉพาะผู้นำเข้าหรือผู้อนุมัติ");
      if (!["staged", "invalid"].includes(row.status))
        throw new AppError(409, "ยกเลิกได้เฉพาะชุดที่ยังไม่เผยแพร่");
      await tx.importBatch.update({
        where: { id: batchId },
        data: { status: "cancelled" },
      });
      await audit(tx, actor.user!.id, "import.cancelled", batchId, {
        reasonEncrypted: encrypt(note),
      });
      return { ok: true };
    });
  }
  if (
    ["questionnaires/update", "questionnaires/archive"].includes(path) &&
    req.method === "POST"
  ) {
    const actor = (await guard("questionnaire:write"))!;
    const raw = await readJson(req);
    const v = (
      path.endsWith("update")
        ? z
            .object({
              id,
              revision,
              questions: z.unknown(),
              rules: z.unknown(),
            })
            .strict()
        : z.object({ id, revision, reason }).strict()
    ).parse(raw);
    const content = path.endsWith("update")
      ? questionnaireSchema.parse(raw)
      : null;
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Questionnaire WHERE id=${v.id} FOR UPDATE`;
      const row = found(
        await tx.questionnaire.findUnique({ where: { id: v.id } }),
      );
      fresh(row, v.revision);
      if (content) {
        if (row.status !== "draft")
          throw new AppError(
            409,
            "แก้ไขได้เฉพาะฉบับร่าง ให้สร้างรุ่นใหม่สำหรับฉบับที่เผยแพร่",
          );
        await tx.questionnaire.update({
          where: { id: v.id },
          data: {
            questions: content.questions,
            rules: content.rules,
            revision: { increment: 1 },
          },
        });
      } else {
        if (row.status === "archived")
          throw new AppError(409, "เก็บเข้าคลังแล้ว");
        if (row.status === "published") {
          const replacement = await tx.questionnaire.findFirst({
            where: { status: "published", version: { gt: row.version } },
          });
          const drafts = await tx.registration.count({
            where: {
              questionnaireVersion: row.version,
              expiresAt: { gt: new Date() },
              booking: null,
            },
          });
          if (!replacement || drafts)
            throw new AppError(
              409,
              "ต้องมีรุ่นที่อนุมัติใหม่กว่าและไม่มีแบบร่างที่ยังใช้งานรุ่นนี้ก่อนถอนเผยแพร่",
            );
        }
        await tx.questionnaire.update({
          where: { id: v.id },
          data: { status: "archived", revision: { increment: 1 } },
        });
      }
      await audit(
        tx,
        actor.user!.id,
        content ? "questionnaire.updated" : "questionnaire.archived",
        v.id,
      );
      return { ok: true };
    });
  }

  const privacyChat = path.match(
    /^manage\/privacy\/([^/]+)\/chats(?:\/([^/]+))?$/,
  );
  if (privacyChat) {
    const actor = (await guard("privacy:write"))!;
    await guard("chat:privacy");
    const requestId = id.parse(privacyChat[1]);
    const eligible = (r: {
      type: string;
      status: string;
      identityVerifiedAt: Date | null;
    }) => {
      if (
        r.type !== "deletion" ||
        r.status !== "processing" ||
        !r.identityVerifiedAt
      )
        throw new AppError(
          409,
          "ใช้ได้เฉพาะคำร้องลบข้อมูลที่ตรวจตัวตนแล้วและอยู่ระหว่างดำเนินการ",
        );
    };
    if (req.method === "GET" && !privacyChat[2]) {
      const r = found(
        await db.privacyRequest.findUnique({ where: { id: requestId } }),
      );
      eligible(r);
      await db.$transaction((tx) =>
        audit(tx, actor.user!.id, "privacy.chat_list_viewed", requestId),
      );
      return db.chatConversation.findMany({
        where: { ownerSessionId: r.sessionId, deletedAt: null },
        select: { id: true, status: true, departmentId: true, createdAt: true },
        take: 100,
        orderBy: { createdAt: "desc" },
      });
    }
    if (req.method !== "POST" || !privacyChat[2])
      throw new AppError(405, "วิธีเรียกไม่ถูกต้อง");
    const conversationId = id.parse(privacyChat[2]),
      v = z
        .object({ revision, reason, confirmed: z.literal(true) })
        .strict()
        .parse(await readJson(req));
    return db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM PrivacyRequest WHERE id=${requestId} FOR UPDATE`;
        const r = found(
          await tx.privacyRequest.findUnique({ where: { id: requestId } }),
        );
        eligible(r);
        await tx.$queryRaw`SELECT id FROM ChatConversation WHERE id=${conversationId} FOR UPDATE`;
        const c = found(
          await tx.chatConversation.findUnique({
            where: { id: conversationId },
          }),
        );
        if (c.deletedAt) {
          const event = await tx.audit.findFirst({
            where: {
              resourceId: conversationId,
              action: "privacy.chat_redacted",
            },
          });
          if (
            event &&
            (event.metadata as { requestId?: string })?.requestId === requestId
          )
            return { ok: true, duplicate: true };
          throw new AppError(404, "ไม่พบแชตในคำร้องนี้");
        }
        fresh(r, v.revision);
        if (c.ownerSessionId !== r.sessionId)
          throw new AppError(404, "ไม่พบแชตในคำร้องนี้");
        await tx.chatMessage.updateMany({
          where: { conversationId },
          data: { bodyEncrypted: encrypt("[ข้อมูลถูกปกปิดตามคำร้อง PDPA]") },
        });
        await tx.chatFeedback.updateMany({
          where: { conversationId },
          data: { commentEncrypted: null },
        });
        await tx.chatConversation.update({
          where: { id: conversationId },
          data: {
            deletedAt: new Date(),
            ownerSessionId: "redacted:" + hash(c.id),
            status: "closed",
            aiPending: false,
            generation: { increment: 1 },
          },
        });
        await tx.privacyRequest.update({
          where: { id: requestId },
          data: { revision: { increment: 1 } },
        });
        await tx.privacyCaseEvent.create({
          data: {
            requestId,
            actorId: actor.user!.id,
            action: "chat_redacted",
            previousStatus: r.status,
            nextStatus: r.status,
            noteEncrypted: encrypt(v.reason),
          },
        });
        await audit(
          tx,
          actor.user!.id,
          "privacy.chat_redacted",
          conversationId,
          { requestId },
        );
        return { ok: true };
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  const bookingAction = path.match(
    /^bookings\/([^/]+)\/(availability|reschedule)$/,
  );
  if (bookingAction) {
    const actor = (await guard("bookings:write"))!;
    const booking = found(
      await db.booking.findUnique({
        where: { id: id.parse(bookingAction[1]) },
      }),
    );
    if (bookingAction[2] === "availability" && req.method === "GET") {
      const from = z.iso
        .date()
        .parse(
          new URL(req.url).searchParams.get("from") ??
            bangkokDate(new Date(Date.now() + 86400000)),
        );
      return availableSlots(new Date(from + "T00:00:00+07:00"), true);
    }
    if (bookingAction[2] === "reschedule" && req.method === "POST") {
      const v = z
        .object({
          slotId: id,
          idempotencyKey: z.string().uuid(),
          reason: reason.max(500),
          patientAgreed: z.literal(true),
        })
        .strict()
        .parse(await readJson(req));
      return rescheduleBooking(
        booking.sessionId,
        booking.id,
        v.slotId,
        v.idempotencyKey,
        { actorId: actor.user!.id, reason: v.reason },
      );
    }
    throw new AppError(405, "วิธีเรียกไม่ถูกต้อง");
  }
  const match = path.match(
    /^manage\/(organizations|services|slots|waitlist|finance|privacy)(?:\/([^/]+))?$/,
  );
  if (!match) return undefined;
  const kind = match[1],
    rowId = match[2],
    url = new URL(req.url),
    get = req.method === "GET";
  const actor = (await guard(permissions[kind]))!;
  await rateLimit("admin-crud:" + actor.user!.id, 180, 60);
  const capabilities = {
    write: permitted(
      actor.user!.role,
      kind === "finance"
        ? "finance:write"
        : kind === "privacy"
          ? "privacy:write"
          : kind === "waitlist"
            ? "bookings:write"
            : permissions[kind],
    ),
    approve: permitted(actor.user!.role, "finance:approve"),
  };
  if (get) {
    if (rowId) {
      if (kind === "organizations") {
        const r = found(
          await db.organization.findUnique({ where: { id: rowId } }),
        );
        await db.$transaction((tx) =>
          audit(tx, actor.user!.id, "organization.viewed", r.id),
        );
        return {
          ...r,
          contact: decrypt<string>(r.contactEncrypted),
          contactEncrypted: undefined,
        };
      }
      if (kind === "services") {
        const r = found(
          await db.service.findUnique({
            where: { id: rowId },
            include: {
              prices: { orderBy: { version: "desc" }, take: 100 },
              packageItems: {
                where: { package: { status: "published" } },
                select: { packageId: true },
              },
            },
          }),
        );
        return {
          ...r,
          prices: r.prices.map((p) => ({ ...p, amount: p.amount.toFixed(2) })),
        };
      }
      if (kind === "waitlist") {
        const r = found(await db.waitlist.findUnique({ where: { id: rowId } }));
        const registration = await db.registration.findFirst({
          where: { ownerSessionId: r.sessionId, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          select: { draftEncrypted: true },
        });
        const person = registration
          ? decrypt<Record<string, unknown>>(registration.draftEncrypted)
          : {};
        const contact = {
          name: [person.firstName, person.lastName]
            .filter((v) => typeof v === "string")
            .join(" ")
            .slice(0, 300),
          phone:
            typeof person.phone === "string" ? person.phone.slice(0, 80) : "",
          email:
            typeof person.email === "string" ? person.email.slice(0, 255) : "",
        };
        const booking = r.bookingId
          ? await db.booking.findUnique({
              where: { id: r.bookingId },
              select: { reference: true },
            })
          : null;
        await db.$transaction((tx) =>
          audit(tx, actor.user!.id, "waitlist.viewed", r.id),
        );
        return {
          ...r,
          sessionId: undefined,
          noteEncrypted: undefined,
          note: r.noteEncrypted ? decrypt<string>(r.noteEncrypted) : "",
          contact,
          bookingReference: booking?.reference ?? "",
        };
      }
      if (kind === "finance") {
        const r = found(
          await db.invoice.findUnique({
            where: { id: rowId },
            include: { entries: { orderBy: { createdAt: "desc" }, take: 100 } },
          }),
        );
        await db.$transaction((tx) =>
          audit(tx, actor.user!.id, "finance.viewed", r.id),
        );
        return {
          ...r,
          entries: r.entries.map((e) => ({
            ...e,
            reason: decrypt<string>(e.reasonEncrypted),
            reference: e.referenceEncrypted
              ? decrypt<string>(e.referenceEncrypted)
              : "",
            reasonEncrypted: undefined,
            referenceEncrypted: undefined,
          })),
        };
      }
      if (kind === "privacy") {
        const r = found(
          await db.privacyRequest.findUnique({
            where: { id: rowId },
            include: { events: { orderBy: { createdAt: "desc" }, take: 100 } },
          }),
        );
        await db.$transaction((tx) =>
          audit(tx, actor.user!.id, "privacy.case_viewed", r.id),
        );
        return {
          ...r,
          sessionId: undefined,
          events: r.events.map((e) => ({
            ...e,
            note: decrypt<string>(e.noteEncrypted),
            noteEncrypted: undefined,
          })),
        };
      }
      throw new AppError(404, "ไม่พบหน้ารายละเอียด");
    }
    const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(url.searchParams.get("page") ?? 1),
      q = z
        .string()
        .max(100)
        .parse(url.searchParams.get("q") ?? "");
    const pagination = { skip: (page - 1) * 25, take: 25 },
      orderBy = { createdAt: "desc" as const };
    let rows: unknown[] = [],
      total = 0;
    if (kind === "organizations") {
      const where = q
        ? { OR: [{ name: { contains: q } }, { id: { contains: q } }] }
        : {};
      [rows, total] = await db.$transaction([
        db.organization.findMany({
          where,
          ...pagination,
          orderBy,
          select: {
            id: true,
            name: true,
            status: true,
            revision: true,
            createdAt: true,
          },
        }),
        db.organization.count({ where }),
      ]);
    }
    if (kind === "services") {
      const where = q
        ? {
            OR: [
              { code: { contains: q } },
              { nameTh: { contains: q } },
              { nameEn: { contains: q } },
            ],
          }
        : {};
      [rows, total] = await db.$transaction([
        db.service.findMany({
          where,
          ...pagination,
          orderBy: { code: "asc" },
          include: { prices: { orderBy: { version: "desc" }, take: 1 } },
        }),
        db.service.count({ where }),
      ]);
    }
    if (kind === "slots") {
      const from = z.iso
        .date()
        .parse(url.searchParams.get("from") ?? bangkokDate(new Date()));
      const where = {
        dayId: { gte: from },
        ...(q ? { dayId: { equals: q } } : {}),
      };
      [rows, total] = await db.$transaction([
        db.slot.findMany({
          where,
          ...pagination,
          orderBy: { startsAt: "asc" },
          include: { day: true },
        }),
        db.slot.count({ where }),
      ]);
      const list = rows as { id: string }[];
      const [b, h] = await Promise.all([
        db.booking.groupBy({
          by: ["slotId"],
          where: {
            slotId: { in: list.map((r) => r.id) },
            status: { in: activeStatuses },
          },
          _count: true,
        }),
        db.hold.groupBy({
          by: ["slotId"],
          where: {
            slotId: { in: list.map((r) => r.id) },
            consumed: false,
            expiresAt: { gt: new Date() },
          },
          _count: true,
        }),
      ]);
      rows = rows.map((r) => ({
        ...(r as object),
        occupied:
          (b.find((x) => x.slotId === (r as { id: string }).id)?._count ?? 0) +
          (h.find((x) => x.slotId === (r as { id: string }).id)?._count ?? 0),
      }));
    }
    if (kind === "waitlist") {
      const where = q
        ? { OR: [{ id: { contains: q } }, { dayId: { contains: q } }] }
        : {};
      const result = await db.waitlist.findMany({
        where,
        ...pagination,
        orderBy: { createdAt: "asc" },
      });
      total = await db.waitlist.count({ where });
      rows = result.map((r) => ({
        ...r,
        sessionId: undefined,
        note: r.noteEncrypted ? decrypt<string>(r.noteEncrypted) : "",
        noteEncrypted: undefined,
      }));
    }
    if (kind === "finance") {
      const where = q
        ? { OR: [{ id: { contains: q } }, { bookingId: { contains: q } }] }
        : {};
      [rows, total] = await db.$transaction([
        db.invoice.findMany({ where, ...pagination, orderBy }),
        db.invoice.count({ where }),
      ]);
    }
    if (kind === "privacy") {
      const where = q
        ? { OR: [{ id: { contains: q } }, { status: { contains: q } }] }
        : {};
      [rows, total] = await db.$transaction([
        db.privacyRequest.findMany({
          where,
          ...pagination,
          orderBy,
          select: {
            id: true,
            type: true,
            status: true,
            assigneeId: true,
            identityVerifiedAt: true,
            identityVerifiedBy: true,
            revision: true,
            createdAt: true,
          },
        }),
        db.privacyRequest.count({ where }),
      ]);
    }
    const assigneePermission =
      kind === "privacy"
        ? "privacy:write"
        : kind === "waitlist"
          ? "bookings:write"
          : null;
    const assignees = assigneePermission
      ? await db.user.findMany({
          where: {
            active: true,
            activationRequired: false,
            mustChangePassword: false,
            mfaSecret: { not: null },
            role: {
              in: staffRoles.filter((role) =>
                permitted(role, assigneePermission),
              ),
            },
          },
          select: { id: true, name: true },
          take: 200,
        })
      : [];
    return { rows, total, page, capabilities, assignees };
  }
  if (req.method !== "POST") throw new AppError(405, "วิธีเรียกไม่ถูกต้อง");
  if (!capabilities.write) throw new AppError(403, "ไม่มีสิทธิ์แก้ไขข้อมูล");
  if (!rowId) {
    if (kind !== "services") throw new AppError(404, "ไม่พบรายการ");
    const v = service
      .omit({ revision: true, reason: true })
      .extend({ code: z.string().trim().min(1).max(80) })
      .strict()
      .parse(await readJson(req));
    return db.$transaction(async (tx) => {
      const r = await tx.service.create({ data: { ...v, componentCodes: [] } });
      await audit(tx, actor.user!.id, "service.created", r.id);
      return { id: r.id };
    });
  }
  id.parse(rowId);
  const raw: unknown = await readJson(req);
  if (kind === "organizations") {
    const v = org.parse(raw);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Organization WHERE id=${rowId} FOR UPDATE`;
      const r = found(
        await tx.organization.findUnique({ where: { id: rowId } }),
      );
      fresh(r, v.revision);
      if (
        v.status === "inactive" &&
        r.status !== "inactive" &&
        (await tx.booking.count({
          where: {
            registration: { organizationId: rowId },
            status: { in: activeStatuses },
            slot: { startsAt: { gt: new Date() } },
          },
        }))
      )
        throw new AppError(
          409,
          "ยังมีนัดขององค์กรในอนาคต ต้องจัดการนัดก่อนปิดองค์กร",
        );
      await tx.organization.update({
        where: { id: rowId },
        data: {
          name: v.name,
          contactEncrypted: encrypt(v.contact),
          status: v.status,
          revision: { increment: 1 },
        },
      });
      await audit(tx, actor.user!.id, "organization.updated", rowId, {
        status: v.status,
        reasonEncrypted: encrypt(v.reason),
      });
      return { ok: true };
    });
  }
  if (kind === "services") {
    const v = service.parse(raw);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Service WHERE id=${rowId} FOR UPDATE`;
      const r = found(await tx.service.findUnique({ where: { id: rowId } }));
      fresh(r, v.revision);
      if (
        r.active &&
        !v.active &&
        (await tx.packageItem.count({
          where: { serviceId: rowId, package: { status: "published" } },
        }))
      )
        throw new AppError(
          409,
          "รายการตรวจยังอยู่ในแพ็กเกจที่เผยแพร่ กรุณาจัดการแพ็กเกจก่อนปิดรายการตรวจ",
        );
      const data = {
        nameTh: v.nameTh,
        nameEn: v.nameEn,
        category: v.category,
        unit: v.unit,
        active: v.active,
        requiresReview: v.requiresReview,
        preparation: v.preparation,
      };
      await tx.service.update({
        where: { id: rowId },
        data: { ...data, revision: { increment: 1 } },
      });
      await audit(tx, actor.user!.id, "service.updated", rowId, {
        active: v.active,
        reasonEncrypted: encrypt(v.reason),
      });
      return { ok: true };
    });
  }
  if (kind === "slots") {
    const v = slot.parse(raw);
    return db.$transaction(
      async (tx) => {
        const before = found(
          await tx.slot.findUnique({ where: { id: rowId } }),
        );
        await tx.$queryRaw`SELECT id FROM DayCapacity WHERE id=${before.dayId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM Slot WHERE id=${rowId} FOR UPDATE`;
        const r = found(await tx.slot.findUnique({ where: { id: rowId } }));
        fresh(r, v.revision);
        if (r.startsAt <= new Date())
          throw new AppError(409, "แก้ไขช่วงเวลาในอดีตไม่ได้");
        const occupied =
          (await tx.booking.count({
            where: { slotId: rowId, status: { in: activeStatuses } },
          })) +
          (await tx.hold.count({
            where: {
              slotId: rowId,
              consumed: false,
              expiresAt: { gt: new Date() },
            },
          }));
        if (
          v.reservedCapacity > v.capacity ||
          v.capacity - v.reservedCapacity < occupied ||
          (v.closed && occupied)
        )
          throw new AppError(
            409,
            "ความจุหรือการปิดช่วงเวลาขัดกับนัด/การสำรองที่ยังมีผล",
          );
        await tx.slot.update({
          where: { id: rowId },
          data: {
            capacity: v.capacity,
            reservedCapacity: v.reservedCapacity,
            closed: v.closed,
            revision: { increment: 1 },
          },
        });
        await audit(tx, actor.user!.id, "slot.configured", rowId, {
          capacity: v.capacity,
          reservedCapacity: v.reservedCapacity,
          closed: v.closed,
          reasonEncrypted: encrypt(v.reason),
        });
        return { ok: true };
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  if (kind === "waitlist") {
    const v = wait.parse(raw);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Waitlist WHERE id=${rowId} FOR UPDATE`;
      const r = found(await tx.waitlist.findUnique({ where: { id: rowId } }));
      fresh(r, v.revision);
      await assignee(tx, v.assigneeId, "bookings:write");
      const allowed: Record<string, string[]> = {
        waiting: ["waiting", "contacted", "closed", "cancelled"],
        contacted: ["contacted", "waiting", "scheduled", "closed", "cancelled"],
        scheduled: ["scheduled", "closed"],
        closed: ["closed", "waiting"],
        cancelled: ["cancelled", "waiting"],
      };
      if (!allowed[r.status]?.includes(v.status))
        throw new AppError(409, "เปลี่ยนสถานะคิวรอไม่ได้ตามลำดับนี้");
      let bookingId: string | null = ["waiting", "contacted"].includes(v.status)
        ? null
        : r.bookingId;
      if (v.status === "scheduled") {
        const b = found(
          await tx.booking.findFirst({
            where: {
              reference: v.bookingReference,
              sessionId: r.sessionId,
              slot: { dayId: r.dayId },
              status: { in: activeStatuses },
            },
          }),
        );
        if (!v.bookingReference) throw new AppError(422, "ต้องระบุเลขนัดจริง");
        bookingId = b.id;
      }
      await tx.waitlist.update({
        where: { id: rowId },
        data: {
          status: v.status,
          assigneeId: v.assigneeId,
          bookingId,
          noteEncrypted: encrypt(v.reason),
          revision: { increment: 1 },
        },
      });
      await audit(tx, actor.user!.id, "waitlist.updated", rowId, {
        status: v.status,
        previousStatus: r.status,
        previousBookingId: r.bookingId,
        bookingId,
        reasonEncrypted: encrypt(v.reason),
      });
      return { ok: true };
    });
  }
  if (kind === "finance") {
    const v = finance.parse(raw);
    if (
      ["approve", "refund", "void"].includes(v.action) &&
      !capabilities.approve
    )
      throw new AppError(403, "ต้องมีสิทธิ์อนุมัติการเงิน");
    if (["payment", "refund"].includes(v.action) && !v.reference)
      throw new AppError(422, "ต้องระบุหลักฐานรับชำระ/คืนเงิน");
    const requestHash = hash(JSON.stringify([rowId, actor.user!.id, v]));
    return db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Invoice WHERE id=${rowId} FOR UPDATE`;
        const r = found(await tx.invoice.findUnique({ where: { id: rowId } }));
        const duplicate = await tx.financeEntry.findUnique({
          where: { idempotencyKey: v.idempotencyKey },
        });
        if (duplicate) {
          if (duplicate.requestHash !== requestHash)
            throw new AppError(409, "รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว");
          return { ok: true, duplicate: true };
        }
        fresh(r, v.revision);
        if (r.status === "void") throw new AppError(409, "เอกสารถูกยกเลิกแล้ว");
        const amount = new Prisma.Decimal(v.amount),
          paid = r.paidAmount ?? new Prisma.Decimal(0);
        const previous = {
          approved: r.approvedAmount?.toFixed(2) ?? null,
          billed: r.actualBilledAmount?.toFixed(2) ?? null,
          paid: paid.toFixed(2),
          status: r.status,
        };
        let approved = r.approvedAmount,
          billed = r.actualBilledAmount,
          nextPaid = paid,
          status = r.status;
        if (v.action === "approve") {
          if (billed)
            throw new AppError(
              409,
              "มีการเรียกเก็บแล้ว แก้ยอดอนุมัติโดยตรงไม่ได้",
            );
          approved = amount;
          status = "approved";
        }
        if (v.action === "bill") {
          if (!approved || amount.gt(approved) || amount.lt(paid))
            throw new AppError(
              409,
              "ยอดเรียกเก็บต้องไม่เกินยอดอนุมัติและไม่น้อยกว่ายอดรับชำระ",
            );
          billed = amount;
          status = amount.eq(paid)
            ? "paid"
            : paid.gt(0)
              ? "partially_paid"
              : "billed";
        }
        if (v.action === "payment") {
          if (!billed || amount.lte(0) || paid.plus(amount).gt(billed))
            throw new AppError(
              409,
              "ยอดรับชำระเกินยอดค้าง หรือยังไม่มีรายการเรียกเก็บ",
            );
          nextPaid = paid.plus(amount);
          status = nextPaid.eq(billed) ? "paid" : "partially_paid";
        }
        if (v.action === "refund") {
          if (amount.lte(0) || amount.gt(paid))
            throw new AppError(409, "ยอดคืนต้องไม่เกินยอดที่รับไว้");
          nextPaid = paid.minus(amount);
          status = nextPaid.gt(0) ? "partially_paid" : "billed";
        }
        if (v.action === "void") {
          if (paid.gt(0) || !amount.eq(0))
            throw new AppError(409, "ต้องคืนเงินและระบุยอดศูนย์ก่อนยกเลิก");
          status = "void";
        }
        const result = {
          approved: approved?.toFixed(2) ?? null,
          billed: billed?.toFixed(2) ?? null,
          paid: nextPaid.toFixed(2),
          status,
        };
        await tx.invoice.update({
          where: { id: rowId },
          data: {
            approvedAmount: approved,
            actualBilledAmount: billed,
            paidAmount: nextPaid,
            status,
            revision: { increment: 1 },
          },
        });
        await tx.financeEntry.create({
          data: {
            invoiceId: rowId,
            actorId: actor.user!.id,
            action: v.action,
            idempotencyKey: v.idempotencyKey,
            requestHash,
            amount,
            previous,
            result,
            reasonEncrypted: encrypt(v.reason),
            referenceEncrypted: v.reference ? encrypt(v.reference) : null,
          },
        });
        await audit(tx, actor.user!.id, "finance." + v.action, rowId, {
          entryKey: v.idempotencyKey,
          status,
        });
        return { ok: true };
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  if (kind === "privacy") {
    const v = privacy.parse(raw);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM PrivacyRequest WHERE id=${rowId} FOR UPDATE`;
      const r = found(
        await tx.privacyRequest.findUnique({ where: { id: rowId } }),
      );
      fresh(r, v.revision);
      await assignee(tx, v.assigneeId, "privacy:write");
      if (v.action === "verify_identity" && v.confirmed !== true)
        throw new AppError(
          422,
          "ต้องยืนยันว่าตรวจตัวตนตามขั้นตอนของโรงพยาบาลแล้ว",
        );
      const terminal = ["completed", "rejected", "closed"].includes(r.status);
      if (terminal && v.action === "verify_identity")
        throw new AppError(409, "คำร้องปิดแล้ว");
      const graph: Record<string, string[]> = {
        pending_identity_review: [
          "pending_identity_review",
          "under_review",
          "awaiting_information",
          "rejected",
          "closed",
        ],
        under_review: [
          "under_review",
          "awaiting_information",
          "processing",
          "rejected",
          "closed",
        ],
        awaiting_information: [
          "awaiting_information",
          "under_review",
          "rejected",
          "closed",
        ],
        processing: [
          "processing",
          "awaiting_information",
          "completed",
          "rejected",
          "closed",
        ],
        completed: ["completed"],
        rejected: ["rejected"],
        closed: ["closed"],
      };
      if (v.action === "update" && !graph[r.status]?.includes(v.status))
        throw new AppError(409, "เปลี่ยนสถานะคำร้องไม่ถูกต้อง");
      if (
        v.action === "update" &&
        ["processing", "completed"].includes(v.status) &&
        !r.identityVerifiedAt
      )
        throw new AppError(409, "ต้องตรวจยืนยันตัวตนก่อนดำเนินคำร้อง");
      const nextStatus = v.action === "verify_identity" ? r.status : v.status;
      await tx.privacyRequest.update({
        where: { id: rowId },
        data: {
          status: nextStatus,
          assigneeId: v.assigneeId,
          revision: { increment: 1 },
          ...(v.action === "verify_identity"
            ? {
                identityVerifiedAt: new Date(),
                identityVerifiedBy: actor.user!.id,
              }
            : {}),
        },
      });
      await tx.privacyCaseEvent.create({
        data: {
          requestId: rowId,
          actorId: actor.user!.id,
          action: v.action,
          previousStatus: r.status,
          nextStatus,
          noteEncrypted: encrypt(v.reason),
        },
      });
      await audit(tx, actor.user!.id, "privacy.case_" + v.action, rowId, {
        status: nextStatus,
      });
      return { ok: true };
    });
  }
  throw new AppError(404, "ไม่พบรายการ");
}
