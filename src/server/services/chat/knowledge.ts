import { z } from "zod";
import {
  db,
  AppError,
  audit,
  departmentAccess,
  staff,
  permitted,
} from "./core";
import { safeKnowledge, relevantEvidence } from "@/lib/chat-safety";
export const knowledgeInput = z
  .object({
    knowledgeId: z.string().max(191).optional(),
    departmentId: z.string().max(40),
    topicKey: z.string().regex(/^[a-zA-Z0-9_:.-]{2,100}$/),
    category: z.string().trim().min(1).max(80),
    clinical: z.boolean(),
    visibility: z.enum(["public", "internal"]).default("public"),
    question: z.string().trim().min(3).max(500),
    answer: z.string().trim().min(3).max(12000),
    keywords: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (v) => new Date(v.expiresAt) > new Date(v.startsAt),
    "ช่วงเผยแพร่ไม่ถูกต้อง",
  );
export async function createKnowledge(
  raw: unknown,
  document?: { name: string; hash: string },
) {
  const actor = await staff("chat:knowledge.write");
  const input = knowledgeInput.parse(raw);
  departmentAccess(actor.agents, input.departmentId);
  return db.$transaction(async (tx) => {
    let root;
    if (input.knowledgeId) {
      await tx.$queryRaw`SELECT id FROM ChatKnowledge WHERE id=${input.knowledgeId} FOR UPDATE`;
      root = await tx.chatKnowledge.findUniqueOrThrow({
        where: { id: input.knowledgeId },
      });
      if (
        root.departmentId !== input.departmentId ||
        root.clinical !== input.clinical ||
        root.visibility !== input.visibility
      )
        throw new AppError(
          422,
          "ห้ามเปลี่ยนหน่วยงาน/ระดับความรู้ของหัวข้อเดิม",
        );
    } else
      root = await tx.chatKnowledge.create({
        data: {
          departmentId: input.departmentId,
          topicKey: input.topicKey,
          category: input.category,
          clinical: input.clinical,
          visibility: input.visibility,
        },
      });
    const max = await tx.chatKnowledgeVersion.aggregate({
      where: { knowledgeId: root.id },
      _max: { version: true },
    });
    const row = await tx.chatKnowledgeVersion.create({
      data: {
        knowledgeId: root.id,
        version: (max._max.version ?? 0) + 1,
        question: input.question,
        answer: input.answer,
        keywords: input.keywords,
        authorId: actor.user!.id,
        startsAt: new Date(input.startsAt),
        expiresAt: new Date(input.expiresAt),
        documentName: document?.name,
        documentHash: document?.hash,
      },
    });
    await tx.chatKnowledgeChunk.createMany({
      data: input.answer
        .match(/[\s\S]{1,500}/g)!
        .map((text, position) => ({ versionId: row.id, position, text })),
    });
    await audit(tx, actor.user!.id, "chat.knowledge_draft", row.id, {
      knowledgeId: root.id,
      version: row.version,
    });
    return row;
  });
}
export async function knowledgeAction(id: string, action: string) {
  const actor = await staff(
    action === "submit"
      ? "chat:knowledge.write"
      : action === "publish" || action === "archive"
        ? "chat:knowledge.publish"
        : "chat:knowledge.review",
  );
  return db.$transaction(async (tx) => {
    const before = await tx.chatKnowledgeVersion.findUnique({
      where: { id },
      include: { knowledge: true },
    });
    if (!before) throw new AppError(404, "ไม่พบความรู้");
    await tx.$queryRaw`SELECT id FROM ChatKnowledge WHERE id=${before.knowledgeId} FOR UPDATE`;
    const row = await tx.chatKnowledgeVersion.findUniqueOrThrow({
      where: { id },
    });
    departmentAccess(actor.agents, before.knowledge.departmentId);
    let status: string;
    if (action === "submit") {
      if (row.status !== "draft" || row.authorId !== actor.user!.id)
        throw new AppError(409, "ส่งตรวจได้เฉพาะแบบร่างของตน");
      status = "pending_review";
    } else if (action === "approve" || action === "reject") {
      if (
        row.status !== "pending_review" ||
        row.authorId === actor.user!.id ||
        (before.knowledge.clinical &&
          !permitted(actor.user!.role, "chat:clinical.review"))
      )
        throw new AppError(
          403,
          "ต้องเป็นผู้ตรวจคนอื่น และมีสิทธิ์วิชาการสำหรับข้อมูลคลินิก",
        );
      status = action === "approve" ? "approved" : "rejected";
    } else if (action === "publish") {
      if (
        row.status !== "approved" ||
        row.expiresAt <= new Date() ||
        !safeKnowledge(row.answer + " " + row.question)
      )
        throw new AppError(409, "เนื้อหายังไม่พร้อมเผยแพร่");
      status = "published";
      const older = await tx.chatKnowledgeVersion.findMany({
        where: {
          knowledgeId: row.knowledgeId,
          status: "published",
          id: { not: id },
        },
      });
      for (const old of older)
        await tx.chatKnowledgeVersion.update({
          where: { id: old.id },
          data:
            row.startsAt <= new Date()
              ? { status: "archived" }
              : {
                  expiresAt: new Date(
                    Math.min(old.expiresAt.getTime(), row.startsAt.getTime()),
                  ),
                },
        });
    } else if (action === "archive") status = "archived";
    else throw new AppError(422, "ไม่รองรับการเปลี่ยนสถานะ");
    const next = await tx.chatKnowledgeVersion.update({
      where: { id },
      data: {
        status,
        ...(["approve", "reject"].includes(action)
          ? { reviewerId: actor.user!.id, reviewedAt: new Date() }
          : {}),
        ...(action === "publish"
          ? { publisherId: actor.user!.id, publishedAt: new Date() }
          : {}),
      },
    });
    await audit(tx, actor.user!.id, "chat.knowledge_" + action, id, { status });
    return next;
  });
}
export async function eligibleEvidence(departmentId?: string) {
  const now = new Date();
  return db.chatKnowledgeVersion.findMany({
    where: {
      status: "published",
      startsAt: { lte: now },
      expiresAt: { gt: now },
      knowledge: {
        visibility: "public",
        department: { active: true },
        ...(departmentId ? { departmentId } : {}),
      },
    },
    include: { knowledge: true },
    orderBy: { publishedAt: "desc" },
    take: 501,
  });
}
export async function retrieve(text: string, departmentId: string) {
  const rows = await eligibleEvidence(departmentId);
  if (rows.length > 500) return { matches: [], reason: "index_capacity" };
  const result = relevantEvidence(text, rows);
  if (
    result.matches.some((v) =>
      /ยา(?!บาล)|วินิจฉัย|prescrib|dosage/i.test(v.answer),
    )
  )
    return { matches: [], reason: "clinical_guidance" };
  if (result.matches.some((v) => /\d[\d,.]*\s*(บาท|THB)|฿\s*\d/.test(v.answer)))
    return { matches: [], reason: "price_requires_catalogue" };
  return result;
}
