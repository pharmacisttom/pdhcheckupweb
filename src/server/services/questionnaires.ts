import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, audit } from "@/lib/security";
export const questionSchema = z
  .object({
    translations: z
      .partialRecord(
        z.enum(["th", "en", "zh-Hans", "my", "km"]),
        z.object({
          label: z.string().min(1).max(500),
          options: z
            .record(z.string().max(100), z.string().max(500))
            .optional(),
        }),
      )
      .optional(),
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/),
    label: z.string().min(1).max(500),
    type: z.enum(["single", "multiple", "numeric", "text"]),
    options: z.array(z.string().min(1).max(100)).max(50).optional(),
    required: z.boolean().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    showIf: z
      .object({
        field: z.string().max(80),
        equals: z.union([z.string().max(100), z.boolean()]),
      })
      .optional(),
  })
  .superRefine((q, ctx) => {
    if (
      ["single", "multiple"].includes(q.type) &&
      (!q.options?.length || new Set(q.options).size !== q.options.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "คำถามแบบตัวเลือกต้องมีตัวเลือกที่ไม่ซ้ำกัน",
      });
    if (q.min !== undefined && q.max !== undefined && q.min > q.max)
      ctx.addIssue({
        code: "custom",
        message: "ช่วงค่าต่ำสุด/สูงสุดไม่ถูกต้อง",
      });
  });
export const questionnaireSchema = z
  .object({
    questions: z.array(questionSchema).min(1).max(100),
    rules: z
      .array(
        z.object({
          translations: z
            .partialRecord(
              z.enum(["th", "en", "zh-Hans", "my", "km"]),
              z.string().max(1000),
            )
            .optional(),
          id: z.string().min(1).max(80),
          field: z.string().min(1).max(80),
          equals: z.union([z.string().max(100), z.boolean()]),
          decision: z.enum([
            "eligible",
            "needs_clinical_review",
            "not_eligible_for_specific_service",
            "suggested_package",
            "suggested_add_on",
            "safety_warning",
          ]),
          reason: z.string().min(1).max(1000),
          serviceCode: z.string().max(80).optional(),
        }),
      )
      .max(200),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const q of data.questions) {
      if (seen.has(q.id) || (q.showIf && !seen.has(q.showIf.field)))
        ctx.addIssue({
          code: "custom",
          message: "รหัสคำถามซ้ำ หรือเงื่อนไขต้องอ้างอิงคำถามก่อนหน้า: " + q.id,
        });
      seen.add(q.id);
    }
    for (const r of data.rules)
      if (!seen.has(r.field))
        ctx.addIssue({
          code: "custom",
          message: "กฎอ้างอิงคำถามที่ไม่มี: " + r.field,
        });
  });
export async function draftQuestionnaire(
  input: z.infer<typeof questionnaireSchema>,
  actorId: string,
) {
  return db.$transaction(async (tx) => {
    const latest = await tx.questionnaire.findFirst({
      orderBy: { version: "desc" },
    });
    const q = await tx.questionnaire.create({
      data: {
        version: (latest?.version ?? 0) + 1,
        questions: input.questions,
        rules: input.rules,
      },
    });
    await audit(tx, actorId, "questionnaire.drafted", q.id);
    return { id: q.id, version: q.version, status: q.status };
  });
}
export async function approveQuestionnaire(id: string, actorId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Questionnaire WHERE id = ${id} FOR UPDATE`;
    const q = await tx.questionnaire.findUniqueOrThrow({ where: { id } });
    if (q.status !== "draft")
      throw new AppError(409, "อนุมัติได้เฉพาะฉบับร่าง");
    questionnaireSchema.parse({ questions: q.questions, rules: q.rules });
    await tx.questionnaire.update({
      where: { id },
      data: { status: "published", approvedBy: actorId },
    });
    await audit(tx, actorId, "questionnaire.published", id);
    return { id, status: "published" };
  });
}
