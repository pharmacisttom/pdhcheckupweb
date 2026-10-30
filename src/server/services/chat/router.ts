import { z } from "zod";
import { CHAT_NOTICE, chatSafetyReason } from "@/lib/chat-safety";
import { hash } from "@/lib/security";
import {
  db,
  AppError,
  audit,
  decrypt,
  encrypt,
  guard,
  permitted,
  rateLimit,
  session,
  configuration,
  publicReady,
  staff,
  departmentAccess,
  owned,
  lock,
  append,
  handoff,
  readMessages,
  publicState,
} from "./core";
import {
  createKnowledge,
  eligibleEvidence,
  knowledgeAction,
  retrieve,
} from "./knowledge";
import { extractKnowledge } from "./import";
import { chooseEvidence } from "./ai";
const id = z.string().min(1).max(191),
  messageInput = z
    .object({
      conversationId: id,
      clientId: z.string().uuid(),
      text: z.string().trim().min(1).max(2000),
    })
    .strict();
async function json<T>(req: Request, schema: z.ZodType<T>) {
  return schema.parse(await req.json());
}
const openWhere = () => ({ deletedAt: null, expiresAt: { gt: new Date() } });
export async function chatRoute(
  req: Request,
  resource: string,
): Promise<unknown> {
  const url = new URL(req.url),
    post = req.method === "POST",
    get = req.method === "GET";
  if (resource === "chat/config" && get) {
    if (process.env.CHAT_ENABLED !== "true") return { enabled: false };
    try {
      const c = await publicReady();
      return {
        enabled: true,
        notice: CHAT_NOTICE,
        noticeText: c.noticeText,
        noticeVersion: c.noticeVersion,
        retentionDays: c.retentionDays,
        aiEnabled:
          c.aiEnabled &&
          process.env.CHAT_AI_ENABLED === "true" &&
          process.env.CHAT_EXTERNAL_PROCESSING_APPROVED === "true",
        handoffEnabled: c.handoffEnabled,
        departments: await db.chatDepartment.findMany({
          where: { active: true },
          select: { id: true, name: true },
        }),
        questions: (await eligibleEvidence())
          .slice(0, 5)
          .map((v) => ({ id: v.id, question: v.question })),
      };
    } catch {
      return { enabled: false };
    }
  }
  if (resource === "chat/source" && get) {
    const versionId = id.parse(url.searchParams.get("id"));
    const row = await db.chatKnowledgeVersion.findFirst({
      where: {
        id: versionId,
        status: "published",
        startsAt: { lte: new Date() },
        expiresAt: { gt: new Date() },
        knowledge: { visibility: "public", department: { active: true } },
      },
      select: {
        id: true,
        question: true,
        answer: true,
        version: true,
        publishedAt: true,
        expiresAt: true,
      },
    });
    if (!row) throw new AppError(404, "แหล่งข้อมูลไม่เผยแพร่หรือหมดอายุแล้ว");
    return row;
  }
  if (resource === "chat/sessions" && post) {
    const cfg = await publicReady();
    const s = (await session())!;
    await rateLimit("chat-create:" + s.id, 10, 3600);
    const v = await json(
      req,
      z
        .object({
          departmentId: z.string().max(40),
          noticeVersion: z.string().max(80),
          acknowledged: z.literal(true),
        })
        .strict(),
    );
    if (v.noticeVersion !== cfg.noticeVersion)
      throw new AppError(409, "กรุณารับทราบประกาศฉบับปัจจุบัน");
    if (
      !(await db.chatDepartment.findFirst({
        where: { id: v.departmentId, active: true },
      }))
    )
      throw new AppError(422, "หน่วยงานไม่เปิดบริการ");
    const row = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Session WHERE id=${s.id} FOR UPDATE`;
      const old = await tx.chatConversation.findFirst({
        where: {
          ownerSessionId: s.id,
          departmentId: v.departmentId,
          status: { in: ["bot", "queued", "active"] },
          noticeVersion: v.noticeVersion,
          deletedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (old) return old;
      const row = await tx.chatConversation.create({
        data: {
          ownerSessionId: s.id,
          departmentId: v.departmentId,
          noticeVersion: v.noticeVersion,
          expiresAt: new Date(Date.now() + cfg.retentionDays! * 86400000),
        },
      });
      await audit(tx, s.id, "chat.created", row.id, {
        noticeVersion: v.noticeVersion,
        departmentId: v.departmentId,
      });
      return row;
    });
    return publicState(row);
  }
  if (resource === "chat/current" && get) {
    await publicReady();
    const s = (await session())!;
    const row = await db.chatConversation.findFirst({
      where: {
        ownerSessionId: s.id,
        ...openWhere(),
        status: { not: "closed" },
      },
      orderBy: { createdAt: "desc" },
    });
    return row ? publicState(row) : null;
  }
  if (resource === "chat/messages" && get) {
    await publicReady();
    const { row } = await owned(
      id.parse(url.searchParams.get("conversationId")),
    );
    const after = z.coerce
      .number()
      .int()
      .min(0)
      .max(400)
      .parse(url.searchParams.get("after") ?? 0);
    return publicState(row, after);
  }
  if (resource === "chat/messages" && post) {
    await publicReady();
    const v = await json(req, messageInput);
    const { s, row } = await owned(v.conversationId);
    await rateLimit("chat-send:" + s.id, 20, 60);
    const reason = chatSafetyReason(v.text);
    const prepared = await db.$transaction(async (tx) => {
      const fresh = await lock(tx, row.id);
      if (
        fresh.ownerSessionId !== s.id ||
        fresh.deletedAt ||
        fresh.expiresAt <= new Date()
      )
        throw new AppError(404, "ไม่พบบทสนทนา");
      const previous = await tx.chatMessage.findUnique({
        where: {
          conversationId_clientId: {
            conversationId: row.id,
            clientId: v.clientId,
          },
        },
      });
      if (previous) {
        if (
          previous.authorType !== "user" ||
          decrypt<string>(previous.bodyEncrypted) !== v.text
        )
          throw new AppError(409, "รหัสข้อความนี้ถูกใช้แล้ว");
        return { duplicate: true, row: fresh };
      }
      if (["closed", "resolved"].includes(fresh.status))
        throw new AppError(409, "บทสนทนานี้ปิดแล้ว กรุณาเริ่มใหม่");
      if (fresh.aiPending)
        throw new AppError(
          409,
          "กำลังประมวลผลข้อความก่อนหน้า กรุณาลองอีกครั้ง",
        );
      const cap = Math.min(
        50,
        Math.max(1, Number(process.env.CHAT_MAX_MESSAGES_PER_SESSION) || 50),
      );
      if (fresh.userMessageCount >= cap)
        throw new AppError(429, "ถึงขีดจำกัดข้อความ กรุณาติดต่อเจ้าหน้าที่");
      await append(tx, row.id, "user", v.text, v.clientId);
      await tx.chatConversation.update({
        where: { id: row.id },
        data: { userMessageCount: { increment: 1 } },
      });
      if (reason && fresh.status === "bot")
        await handoff(tx, fresh, reason, s.id);
      const reserved =
        fresh.status === "bot" && !reason
          ? await tx.chatConversation.update({
              where: { id: fresh.id },
              data: {
                aiPending: true,
                pendingSince: new Date(),
                generation: { increment: 1 },
              },
            })
          : fresh;
      return { duplicate: false, row: reserved };
    });
    if (prepared.duplicate || prepared.row.status !== "bot" || reason)
      return publicState(
        await db.chatConversation.findUniqueOrThrow({ where: { id: row.id } }),
      );
    const evidence = await retrieve(v.text, row.departmentId);
    if (!evidence.matches.length) {
      await db.$transaction(async (tx) =>
        handoff(tx, await lock(tx, row.id), evidence.reason, s.id),
      );
      return publicState(
        await db.chatConversation.findUniqueOrThrow({ where: { id: row.id } }),
      );
    }
    const generation = await db.$transaction(async (tx) => {
      const fresh = await lock(tx, row.id);
      if (fresh.status !== "bot" || fresh.deletedAt) return null;
      if (fresh.generation !== prepared.row.generation) return null;
      return fresh;
    });
    if (!generation)
      return publicState(
        await db.chatConversation.findUniqueOrThrow({ where: { id: row.id } }),
      );
    const selected = await chooseEvidence(row.id, evidence.matches);
    await db.$transaction(
      async (tx) => {
        const fresh = await lock(tx, row.id);
        await tx.$queryRaw`SELECT id FROM ChatConfiguration WHERE id='default' FOR SHARE`;
        const current = await tx.chatConfiguration.findUniqueOrThrow({
          where: { id: "default" },
        });
        if (
          fresh.status !== "bot" ||
          fresh.generation !== generation.generation ||
          fresh.deletedAt ||
          fresh.expiresAt <= new Date()
        )
          return;
        if (!current.enabled) {
          await tx.chatConversation.update({
            where: { id: row.id },
            data: { aiPending: false },
          });
          return;
        }
        if (selected.status === "provider_selected" && !current.aiEnabled) {
          await handoff(tx, fresh, "ai_disabled", s.id);
          return;
        }
        const selectedRoot = evidence.matches.find(
          (k) => k.id === selected.id,
        )?.knowledgeId;
        if (selectedRoot)
          await tx.$queryRaw`SELECT id FROM ChatKnowledge WHERE id=${selectedRoot} FOR SHARE`;
        const valid = await tx.chatKnowledgeVersion.findFirst({
          where: {
            id: selected.id,
            status: "published",
            startsAt: { lte: new Date() },
            expiresAt: { gt: new Date() },
            knowledge: {
              visibility: "public",
              departmentId: row.departmentId,
              department: { active: true },
            },
          },
        });
        if (!valid) {
          await handoff(tx, fresh, "evidence_withdrawn", s.id);
          return;
        }
        const message = await append(
          tx,
          row.id,
          "assistant",
          valid.answer,
          "answer:" + v.clientId,
        );
        await tx.chatKnowledgeCitation.create({
          data: { messageId: message.id, versionId: valid.id },
        });
        await tx.chatConversation.update({
          where: { id: row.id },
          data: { aiPending: false, pendingSince: null },
        });
        await audit(tx, s.id, "chat.evidence_answer", row.id, {
          versionId: valid.id,
          mode: selected.status,
        });
      },
      { isolationLevel: "ReadCommitted" },
    );
    return publicState(
      await db.chatConversation.findUniqueOrThrow({ where: { id: row.id } }),
    );
  }
  if (resource === "chat/handoff" && post) {
    const cfg = await publicReady();
    if (!cfg.handoffEnabled)
      throw new AppError(
        503,
        "ขณะนี้ไม่เปิดคิวเจ้าหน้าที่ กรุณาติดต่อโรงพยาบาล",
      );
    const v = await json(req, z.object({ conversationId: id }).strict());
    const { s, row } = await owned(v.conversationId);
    await rateLimit("chat-handoff:" + s.id, 10, 60);
    await db.$transaction(async (tx) =>
      handoff(tx, await lock(tx, row.id), "user_requested", s.id),
    );
    return publicState(
      await db.chatConversation.findUniqueOrThrow({ where: { id: row.id } }),
    );
  }
  if (resource === "chat/close" && post) {
    const v = await json(req, z.object({ conversationId: id }).strict());
    const { s, row } = await owned(v.conversationId);
    await db.$transaction(async (tx) => {
      await lock(tx, row.id);
      await tx.chatConversation.update({
        where: { id: row.id },
        data: {
          status: "closed",
          closedAt: new Date(),
          aiPending: false,
          generation: { increment: 1 },
        },
      });
      await audit(tx, s.id, "chat.closed_by_owner", row.id);
    });
    return { ok: true };
  }
  if (resource === "chat/feedback" && post) {
    const v = await json(
      req,
      z
        .object({
          conversationId: id,
          rating: z.number().int().min(1).max(5),
          comment: z.string().trim().max(500).optional(),
        })
        .strict(),
    );
    const { s, row } = await owned(v.conversationId);
    await rateLimit("chat-feedback:" + s.id, 10, 60);
    await db.$transaction(async (tx) => {
      const fresh = await lock(tx, row.id);
      await tx.chatFeedback.upsert({
        where: { conversationId: row.id },
        create: {
          conversationId: row.id,
          rating: v.rating,
          commentEncrypted: v.comment ? encrypt(v.comment) : null,
        },
        update: {
          rating: v.rating,
          commentEncrypted: v.comment ? encrypt(v.comment) : null,
        },
      });
      if (v.rating <= 2 && fresh.status === "bot")
        await handoff(tx, fresh, "dissatisfied", s.id);
      await audit(tx, s.id, "chat.feedback", row.id, { rating: v.rating });
    });
    return { ok: true };
  }
  if (resource === "admin/chat/settings" && get) {
    const actor = (await guard("chat:settings.read"))!;
    const current = await configuration();
    return {
      canManageSettings: permitted(actor.user!.role, "chat:settings"),
      policyFingerprint: hash(
        JSON.stringify([
          current.noticeVersion,
          current.noticeText,
          current.retentionDays,
        ]),
      ),
      ...(await configuration()),
      canApprovePolicy: permitted(actor.user!.role, "chat:privacy"),
      environmentEnabled: process.env.CHAT_ENABLED === "true",
      provider: process.env.CHAT_AI_PROVIDER ?? "disabled",
      externalApproved:
        process.env.CHAT_EXTERNAL_PROCESSING_APPROVED === "true",
      departments: await db.chatDepartment.findMany({
        include: {
          agents: {
            include: { user: { select: { id: true, name: true, role: true } } },
          },
        },
      }),
      users: await db.user.findMany({
        where: {
          active: true,
          activationRequired: false,
          mustChangePassword: false,
          mfaSecret: { not: null },
        },
        select: { id: true, name: true, role: true },
        take: 200,
      }),
    };
  }
  if (resource === "admin/chat/settings" && post) {
    const actor = (await guard("chat:settings"))!;
    const v = await json(
      req,
      z
        .object({
          enabled: z.boolean(),
          aiEnabled: z.boolean(),
          handoffEnabled: z.boolean(),
          noticeVersion: z.string().trim().min(1).max(80),
          noticeText: z.string().trim().min(20).max(3000),
          retentionDays: z.number().int().min(1).max(3650),
          monthlyTokenLimit: z.number().int().min(0).max(100000000),
          monthlyRequestLimit: z.number().int().min(0).max(1000000),
          monthlyBudgetUsd: z.number().min(0).max(100000),
          slaMinutes: z.number().int().min(1).max(1440),
        })
        .strict(),
    );
    await rateLimit("chat-settings:" + actor.user!.id, 20, 60);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ChatConfiguration WHERE id='default' FOR UPDATE`;
      const old = await tx.chatConfiguration.findUniqueOrThrow({
        where: { id: "default" },
      });
      const changed =
        old.noticeVersion !== v.noticeVersion ||
        old.noticeText !== v.noticeText ||
        old.retentionDays !== v.retentionDays;
      if (v.enabled && (changed || !old.policyApprovedAt))
        throw new AppError(
          409,
          "บันทึกประกาศขณะปิดแชตและให้ผู้มีสิทธิ์อนุมัติก่อนเปิดบริการ",
        );
      const next = await tx.chatConfiguration.update({
        where: { id: "default" },
        data: {
          ...v,
          ...(changed
            ? { policyApprovedAt: null, policyApprovedBy: null }
            : {}),
        },
      });
      await audit(tx, actor.user!.id, "chat.settings_changed", "default", {
        enabled: v.enabled,
        aiEnabled: v.aiEnabled,
      });
      return next;
    });
  }
  if (resource === "admin/chat/policy" && post) {
    const actor = (await guard("chat:privacy"))!;
    const v = await json(
      req,
      z
        .object({
          noticeVersion: z.string().max(80),
          fingerprint: z.string().length(64),
          confirmed: z.literal(true),
        })
        .strict(),
    );
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ChatConfiguration WHERE id='default' FOR UPDATE`;
      const c = await tx.chatConfiguration.findUniqueOrThrow({
        where: { id: "default" },
      });
      if (
        !c.noticeText ||
        !c.retentionDays ||
        c.noticeVersion !== v.noticeVersion ||
        hash(
          JSON.stringify([c.noticeVersion, c.noticeText, c.retentionDays]),
        ) !== v.fingerprint
      )
        throw new AppError(409, "ประกาศเปลี่ยนแปลง กรุณาตรวจใหม่");
      await tx.chatConfiguration.update({
        where: { id: "default" },
        data: {
          policyApprovedBy: actor.user!.id,
          policyApprovedAt: new Date(),
        },
      });
      await audit(tx, actor.user!.id, "chat.policy_approved", "default", {
        noticeVersion: v.noticeVersion,
      });
      return { ok: true };
    });
  }
  if (resource === "admin/chat/departments" && post) {
    const actor = (await guard("chat:settings"))!;
    const v = await json(
      req,
      z
        .object({
          id: z.string().regex(/^[a-z_]{2,40}$/),
          name: z.string().trim().min(1).max(160),
          active: z.boolean(),
        })
        .strict(),
    );
    await db.$transaction(async (tx) => {
      await tx.chatDepartment.upsert({
        where: { id: v.id },
        create: v,
        update: { name: v.name, active: v.active },
      });
      await audit(tx, actor.user!.id, "chat.department_updated", v.id);
    });
    return { ok: true };
  }
  if (resource === "admin/chat/agents" && post) {
    const actor = (await guard("chat:settings"))!;
    const v = await json(
      req,
      z
        .object({
          userId: id,
          departmentId: z.string().max(40),
          active: z.boolean(),
        })
        .strict(),
    );
    const u = await db.user.findFirst({
      where: {
        id: v.userId,
        active: true,
        activationRequired: false,
        mustChangePassword: false,
        mfaSecret: { not: null },
      },
    });
    if (!u || !permitted(u.role, "chat:reply"))
      throw new AppError(422, "บัญชีต้องมีสิทธิ์ตอบแชตและยืนยัน MFA แล้ว");
    await db.$transaction(async (tx) => {
      await tx.chatAgent.upsert({
        where: {
          userId_departmentId: {
            userId: v.userId,
            departmentId: v.departmentId,
          },
        },
        create: v,
        update: { active: v.active, availableUntil: null },
      });
      await audit(tx, actor.user!.id, "chat.agent_updated", v.userId, {
        departmentId: v.departmentId,
        active: v.active,
      });
    });
    return { ok: true };
  }
  if (resource === "admin/chat/canned" && get) {
    const actor = await staff("chat:reply");
    const departmentId = z
      .string()
      .max(40)
      .parse(url.searchParams.get("departmentId"));
    departmentAccess(actor.agents, departmentId);
    return (await eligibleEvidence(departmentId))
      .slice(0, 30)
      .map((v) => ({ id: v.id, question: v.question, answer: v.answer }));
  }
  if (resource === "admin/chat/conversations" && get) {
    const actor = await staff("chat:read");
    const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .parse(url.searchParams.get("page") ?? 1),
      departmentId = url.searchParams.get("departmentId");
    if (departmentId) departmentAccess(actor.agents, departmentId);
    const where = {
      ...openWhere(),
      departmentId: departmentId ?? {
        in: actor.agents.map((a) => a.departmentId),
      },
    };
    const [rows, total, queued] = await db.$transaction([
      db.chatConversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * 25,
        take: 25,
        select: {
          id: true,
          status: true,
          departmentId: true,
          assignedAgentId: true,
          createdAt: true,
          updatedAt: true,
          queuedAt: true,
          handoffReason: true,
          lastSequence: true,
        },
      }),
      db.chatConversation.count({ where }),
      db.chatConversation.count({ where: { ...where, status: "queued" } }),
    ]);
    await db.$transaction((tx) =>
      audit(tx, actor.user!.id, "chat.inbox_viewed", "inbox"),
    );
    return {
      rows,
      total,
      queued,
      slaMinutes: (await configuration()).slaMinutes,
      departments: actor.agents,
    };
  }
  if (resource === "admin/chat/departments" && get) {
    await staff("chat:read");
    return db.chatDepartment.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });
  }
  const match = resource.match(
    /^admin\/chat\/conversations\/([^/]+)(?:\/(reply|assign|transfer|close|reopen|note|resolve|redact|typing))?$/,
  );
  if (match) {
    const actor = await staff(
      match[2] === "redact"
        ? "chat:privacy"
        : match[2]
          ? "chat:reply"
          : "chat:read",
    );
    const row = await db.chatConversation.findFirst({
      where: { id: match[1], deletedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new AppError(404, "ไม่พบบทสนทนา");
    if (match[2] !== "redact") departmentAccess(actor.agents, row.departmentId);
    if (get && !match[2]) {
      const after = z.coerce
        .number()
        .int()
        .min(0)
        .max(400)
        .parse(url.searchParams.get("after") ?? 0);
      return db.$transaction(async (tx) => {
        const fresh = await lock(tx, row.id);
        if (fresh.deletedAt || fresh.expiresAt <= new Date())
          throw new AppError(404, "ไม่พบบทสนทนา");
        const memberships = await tx.chatAgent.findMany({
          where: {
            userId: actor.user!.id,
            active: true,
            department: { active: true },
          },
        });
        departmentAccess(memberships, fresh.departmentId);
        if (after === 0)
          await audit(
            tx,
            actor.user!.id,
            "chat.conversation_viewed",
            fresh.id,
            { departmentId: fresh.departmentId },
          );
        return {
          id: fresh.id,
          status: fresh.status,
          departmentId: fresh.departmentId,
          assignedAgentId: fresh.assignedAgentId,
          lastSequence: fresh.lastSequence,
          ownAgentId: memberships.find(
            (a) => a.departmentId === fresh.departmentId,
          )?.id,
          messages: await readMessages(fresh, after, true, tx),
          agents: await tx.chatAgent.findMany({
            where: {
              departmentId: fresh.departmentId,
              active: true,
              user: { active: true },
            },
            select: { id: true, user: { select: { name: true } } },
          }),
        };
      });
    }
    if (!post) throw new AppError(405, "วิธีเรียกไม่ถูกต้อง");
    const action = match[2];
    const v = await json(
      req,
      z
        .object({
          clientId: z.string().uuid().optional(),
          text: z.string().trim().min(1).max(2000).optional(),
          agentId: id.optional(),
          departmentId: z.string().max(40).optional(),
        })
        .strict(),
    );
    return db.$transaction(async (tx) => {
      const fresh = await lock(tx, row.id);
      if (fresh.deletedAt || fresh.expiresAt <= new Date())
        throw new AppError(404, "ไม่พบบทสนทนา");
      if (action !== "redact")
        departmentAccess(actor.agents, fresh.departmentId);
      const ownAgent = actor.agents.find(
        (a) => a.departmentId === fresh.departmentId,
      );
      if (action === "typing") {
        if (fresh.status !== "active" || fresh.assignedAgentId !== ownAgent?.id)
          throw new AppError(403, "ต้องเป็นผู้รับผิดชอบบทสนทนา");
        await tx.chatConversation.update({
          where: { id: fresh.id },
          data: { staffTypingUntil: new Date(Date.now() + 5000) },
        });
        return { ok: true };
      }
      if (action === "reply" || action === "note") {
        if (!v.text || !v.clientId)
          throw new AppError(422, "กรุณาระบุข้อความและรหัสข้อความ");
        const previous = await tx.chatMessage.findUnique({
          where: {
            conversationId_clientId: {
              conversationId: fresh.id,
              clientId: v.clientId,
            },
          },
        });
        if (previous) {
          if (
            previous.authorId !== actor.user!.id ||
            decrypt<string>(previous.bodyEncrypted) !== v.text ||
            previous.authorType !== (action === "note" ? "note" : "staff")
          )
            throw new AppError(409, "รหัสข้อความถูกใช้แล้ว");
          return { ok: true, duplicate: true };
        }
        if (fresh.status !== "active" || fresh.assignedAgentId !== ownAgent?.id)
          throw new AppError(409, "กรุณารับแชตก่อนตอบ");
        await append(
          tx,
          fresh.id,
          action === "note" ? "note" : "staff",
          v.text,
          v.clientId,
          actor.user!.id,
        );
        if (action === "reply" && !fresh.firstReplyAt)
          await tx.chatConversation.update({
            where: { id: fresh.id },
            data: { firstReplyAt: new Date() },
          });
      } else if (action === "assign") {
        if (!["bot", "queued", "active"].includes(fresh.status))
          throw new AppError(409, "ไม่สามารถรับแชตสถานะนี้");
        if (
          fresh.assignedAgentId &&
          fresh.assignedAgentId !== ownAgent?.id &&
          !permitted(actor.user!.role, "chat:assign")
        )
          throw new AppError(403, "แชตมีผู้รับผิดชอบแล้ว");
        const target = v.agentId ?? ownAgent?.id;
        const agent = await tx.chatAgent.findFirst({
          where: {
            id: target,
            departmentId: fresh.departmentId,
            active: true,
            user: {
              active: true,
              activationRequired: false,
              mustChangePassword: false,
              mfaSecret: { not: null },
            },
          },
        });
        if (
          !agent ||
          (v.agentId &&
            v.agentId !== ownAgent?.id &&
            !permitted(actor.user!.role, "chat:assign"))
        )
          throw new AppError(403, "ผู้รับผิดชอบไม่มีสิทธิ์");
        await tx.chatConversation.update({
          where: { id: fresh.id },
          data: {
            status: "active",
            assignedAgentId: agent.id,
            acceptedAt: fresh.acceptedAt ?? new Date(),
            aiPending: false,
            generation: { increment: 1 },
          },
        });
        await tx.chatAssignment.create({
          data: {
            conversationId: fresh.id,
            actorId: actor.user!.id,
            targetAgentId: agent.id,
            departmentId: fresh.departmentId,
            action: "assigned",
          },
        });
      } else if (action === "transfer") {
        if (
          !v.departmentId ||
          !(await tx.chatDepartment.findFirst({
            where: { id: v.departmentId, active: true },
          }))
        )
          throw new AppError(422, "หน่วยงานปลายทางไม่เปิดบริการ");
        if (fresh.status === "closed")
          throw new AppError(409, "บทสนทนาปิดแล้ว");
        await tx.chatConversation.update({
          where: { id: fresh.id },
          data: {
            departmentId: v.departmentId,
            status: "queued",
            acceptedAt: null,
            assignedAgentId: null,
            queuedAt: new Date(),
            aiPending: false,
            generation: { increment: 1 },
          },
        });
        await tx.chatAssignment.create({
          data: {
            conversationId: fresh.id,
            actorId: actor.user!.id,
            departmentId: v.departmentId,
            action: "transferred",
          },
        });
      } else if (
        action === "close" ||
        action === "resolve" ||
        action === "reopen"
      ) {
        const status =
          action === "close"
            ? "closed"
            : action === "resolve"
              ? "resolved"
              : "queued";
        if (
          (action === "reopen" &&
            !["closed", "resolved"].includes(fresh.status)) ||
          (action !== "reopen" && fresh.status === "closed")
        )
          throw new AppError(409, "เปลี่ยนสถานะไม่ได้");
        await tx.chatConversation.update({
          where: { id: fresh.id },
          data: {
            status,
            aiPending: false,
            generation: { increment: 1 },
            ...(action === "close"
              ? { closedAt: new Date() }
              : action === "resolve"
                ? { resolvedAt: new Date() }
                : {
                    closedAt: null,
                    resolvedAt: null,
                    acceptedAt: null,
                    assignedAgentId: null,
                    queuedAt: new Date(),
                  }),
          },
        });
      } else if (action === "redact") {
        await tx.chatMessage.updateMany({
          where: { conversationId: fresh.id },
          data: { bodyEncrypted: encrypt("[ข้อมูลถูกปกปิดตามนโยบาย]") },
        });
        await tx.chatFeedback.updateMany({
          where: { conversationId: fresh.id },
          data: { commentEncrypted: null },
        });
        await tx.chatConversation.update({
          where: { id: fresh.id },
          data: {
            deletedAt: new Date(),
            ownerSessionId: "redacted:" + hash(fresh.id),
            aiPending: false,
            status: "closed",
            generation: { increment: 1 },
          },
        });
      } else throw new AppError(404, "ไม่พบการดำเนินการ");
      await audit(tx, actor.user!.id, "chat." + action, fresh.id, {
        departmentId: fresh.departmentId,
      });
      return { ok: true };
    });
  }
  if (resource === "admin/chat/knowledge" && get) {
    const actor = await staff("chat:knowledge.write");
    return db.chatKnowledgeVersion.findMany({
      where: {
        knowledge: {
          departmentId: { in: actor.agents.map((a) => a.departmentId) },
        },
      },
      include: { knowledge: true, _count: { select: { citations: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  if (resource === "admin/chat/knowledge" && post)
    return createKnowledge(await req.json());
  if (resource === "admin/chat/knowledge/import" && post) {
    await staff("chat:knowledge.write");
    const form = await req.formData(),
      file = form.get("file");
    if (!(file instanceof File)) throw new AppError(422, "กรุณาเลือกเอกสาร");
    const text = await extractKnowledge(file);
    return createKnowledge(
      { ...JSON.parse(String(form.get("metadata"))), answer: text },
      {
        name: file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 191),
        hash: hash(Buffer.from(await file.arrayBuffer()).toString("base64")),
      },
    );
  }
  const version = resource.match(
    /^admin\/chat\/knowledge\/([^/]+)\/(submit|approve|reject|publish|archive)$/,
  );
  if (version && post) return knowledgeAction(version[1], version[2]);
  if (resource === "admin/chat/reports" && get) {
    await guard("chat:reports");
    return chatReport(url);
  }
  throw new AppError(404, "ไม่พบคำสั่งแชต");
}
export async function chatReport(url: URL) {
  const from = z.iso
    .date()
    .parse(
      url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10),
    );
  const to = z.iso.date().parse(url.searchParams.get("to") ?? from);
  const start = new Date(from + "T00:00:00+07:00"),
    end = new Date(new Date(to + "T00:00:00+07:00").getTime() + 86400000);
  if (end <= start || end.getTime() - start.getTime() > 366 * 86400000)
    throw new AppError(422, "เลือกช่วงไม่เกิน 366 วัน");
  const departmentId = url.searchParams.get("departmentId");
  const where = {
    createdAt: { gte: start, lt: end },
    ...(departmentId ? { departmentId } : {}),
  };
  if ((await db.chatConversation.count({ where })) > 20000)
    throw new AppError(422, "ข้อมูลมากเกินไป กรุณาลดช่วงเวลา");
  const rows = await db.chatConversation.findMany({
    where,
    select: {
      createdAt: true,
      queuedAt: true,
      acceptedAt: true,
      firstReplyAt: true,
      closedAt: true,
      status: true,
      handoffReason: true,
      departmentId: true,
      feedback: { select: { rating: true } },
      _count: { select: { messages: true } },
    },
  });
  const usage = await db.chatAIUsage.aggregate({
    where: {
      createdAt: { gte: start, lt: end },
      ...(departmentId ? { conversation: { departmentId } } : {}),
    },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      reservedUsd: true,
      estimatedCostUsd: true,
    },
    _count: true,
  });
  const citations = await db.chatKnowledgeCitation.groupBy({
    by: ["versionId"],
    where: { message: { conversation: where } },
    _count: true,
    orderBy: { _count: { versionId: "desc" } },
    take: 10,
  });
  const topics = await db.chatKnowledgeVersion.findMany({
    where: { id: { in: citations.map((c) => c.versionId) } },
    select: { id: true, question: true },
  });
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const daily: Record<string, number> = {};
  for (const r of rows) {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
    }).format(r.createdAt);
    daily[date] = (daily[date] ?? 0) + 1;
  }
  return {
    conversations: rows.length,
    queued: rows.filter((r) => r.status === "queued").length,
    handoffs: rows.filter((r) => r.queuedAt).length,
    handoffRate: rows.length
      ? rows.filter((r) => r.queuedAt).length / rows.length
      : null,
    averageWaitSeconds: avg(
      rows
        .filter((r) => r.queuedAt && r.acceptedAt)
        .map((r) => (r.acceptedAt!.getTime() - r.queuedAt!.getTime()) / 1000),
    ),
    averageFirstReplySeconds: avg(
      rows
        .filter((r) => r.firstReplyAt)
        .map((r) => (r.firstReplyAt!.getTime() - r.createdAt.getTime()) / 1000),
    ),
    averageCloseSeconds: avg(
      rows
        .filter((r) => r.closedAt)
        .map((r) => (r.closedAt!.getTime() - r.createdAt.getTime()) / 1000),
    ),
    satisfaction: avg(
      rows.flatMap((r) => (r.feedback ? [r.feedback.rating] : [])),
    ),
    unmatched: rows.filter((r) => r.handoffReason === "insufficient_evidence")
      .length,
    conflicts: rows.filter((r) => r.handoffReason === "conflicting_evidence")
      .length,
    daily,
    usage,
    topKnowledge: citations.map((c) => ({
      title:
        topics.find((t) => t.id === c.versionId)?.question ?? "ถอนเผยแพร่แล้ว",
      count: c._count,
    })),
    expiringKnowledge: await db.chatKnowledgeVersion.count({
      where: {
        status: "published",
        expiresAt: { gt: new Date(), lte: new Date(Date.now() + 7 * 86400000) },
        ...(departmentId ? { knowledge: { departmentId } } : {}),
      },
    }),
  };
}
export async function redactExpiredChat() {
  const rows = await db.chatConversation.findMany({
    where: { expiresAt: { lte: new Date() }, deletedAt: null },
    take: 100,
  });
  for (const r of rows)
    await db.$transaction(async (tx) => {
      const fresh = await lock(tx, r.id);
      if (fresh.deletedAt || fresh.expiresAt > new Date()) return;
      await tx.chatMessage.updateMany({
        where: { conversationId: r.id },
        data: { bodyEncrypted: encrypt("[หมดระยะเวลาเก็บข้อมูล]") },
      });
      await tx.chatFeedback.updateMany({
        where: { conversationId: r.id },
        data: { commentEncrypted: null },
      });
      await tx.chatConversation.update({
        where: { id: r.id },
        data: {
          deletedAt: new Date(),
          ownerSessionId: "expired:" + hash(r.id),
          aiPending: false,
          status: "closed",
          generation: { increment: 1 },
        },
      });
      await audit(
        tx,
        "chat-retention-worker",
        "chat.retention_redacted",
        r.id,
        {},
        crypto.randomUUID(),
      );
    });
  return { processed: rows.length };
}
