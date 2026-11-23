import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { AppError, audit, decrypt, encrypt, privateHash } from "@/lib/security";
import { checkpointInput } from "@/lib/registration-checkpoint";
import { normalizePhone } from "@/lib/domain";
import { PRIVACY_VERSION } from "@/lib/intake";
import { z } from "zod";

export async function saveRegistrationCheckpoint(
  sessionId: string,
  input: z.infer<typeof checkpointInput>,
) {
  if (input.noticeVersion !== PRIVACY_VERSION)
    throw new AppError(409, "กรุณารับทราบประกาศฉบับปัจจุบัน", "NOTICE_CHANGED");
  const id =
    input.id ??
    privateHash("registration:" + sessionId + ":" + input.requestId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Session WHERE id = ${sessionId} FOR UPDATE`;
    const existing = await tx.registration.findUnique({
      where: { id },
      include: { booking: { select: { id: true } } },
    });
    if (existing && existing.ownerSessionId !== sessionId)
      throw new AppError(404, "ไม่พบแบบร่าง");
    if (input.id && !existing) throw new AppError(404, "ไม่พบแบบร่าง");
    if (
      existing?.booking ||
      (await tx.contactRequest.findUnique({
        where: { registrationId: id },
        select: { id: true },
      }))
    )
      throw new AppError(
        409,
        "ส่งข้อมูลแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อแก้ไข",
        "DRAFT_SUBMITTED",
      );
    const previous = existing
      ? decrypt<Record<string, unknown>>(existing.draftEncrypted)
      : null;
    if ((previous?._draftToken ?? null) !== (input.draftToken ?? null))
      throw new AppError(
        409,
        "ข้อมูลแบบร่างเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุด",
        "DRAFT_CONFLICT",
      );
    const questionnaire = await tx.questionnaire.findFirst({
      where: {
        version: input.questionnaireVersion,
        approvedBy: { not: null },
        status: "published",
      },
    });
    if (!questionnaire) throw new AppError(422, "แบบประเมินไม่ถูกต้อง");
    let phone =
      typeof input.person.phone === "string" ? input.person.phone : undefined;
    try {
      if (phone) phone = normalizePhone(phone);
    } catch {
      /* Retain unfinished input only in encrypted checkpoint. */
    }
    const draftToken = randomUUID();
    const person = {
      ...input.person,
      phone,
      _draftCheckpoint: true,
      _draftToken: draftToken,
      _draftStep: input.step,
    };
    const record = {
      draftEncrypted: encrypt(person),
      assessmentEncrypted: encrypt(input.answers),
      questionnaireVersion: input.questionnaireVersion,
      expiresAt: new Date(Date.now() + 86400000),
    };
    if (existing) await tx.registration.update({ where: { id }, data: record });
    else
      await tx.registration.create({
        data: { id, ownerSessionId: sessionId, ...record },
      });
    if (
      !(await tx.privacyRecord.findFirst({
        where: {
          sessionId,
          purpose: "registration_draft",
          noticeVersion: PRIVACY_VERSION,
        },
      }))
    )
      await tx.privacyRecord.create({
        data: {
          sessionId,
          purpose: "registration_draft",
          noticeVersion: PRIVACY_VERSION,
        },
      });
    await audit(tx, sessionId, "registration.checkpoint_saved", id);
    return { id, draftToken };
  });
}
