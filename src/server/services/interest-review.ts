import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, audit, decrypt, encrypt } from "@/lib/security";
import { canReviewTransition } from "@/lib/intake";
import { createQuote } from "./pricing";
export const reviewInput = z.object({
  id: z.string().min(1).max(100),
  status: z.enum([
    "contacted",
    "submitted",
    "under_review",
    "awaiting_information",
    "ready_to_schedule",
    "closed",
  ]),
  note: z.string().trim().max(2000),
  assignedTo: z.string().max(191).optional(),
  entitlementStatus: z
    .enum(["unverified", "pending", "verified", "unable_to_verify"])
    .default("unverified"),
  informationRequest: z.string().trim().max(2000).optional(),
  dataReview: z.string().trim().max(2000).default(""),
  entitlementReview: z.string().trim().max(2000).default(""),
});
export async function updateReview(
  actorId: string,
  input: z.infer<typeof reviewInput>,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ContactRequest WHERE id = ${input.id} FOR UPDATE`;
    const r = await tx.contactRequest.findUnique({ where: { id: input.id } });
    if (!r) throw new AppError(404, "ไม่พบรายการ");
    if (!canReviewTransition(r.status, input.status))
      throw new AppError(409, "เปลี่ยนสถานะนี้ไม่ได้");
    if (
      input.assignedTo &&
      !(await tx.user.findFirst({
        where: {
          id: input.assignedTo,
          active: true,
          role: { in: ["superadmin", "manager", "registration"] },
        },
      }))
    )
      throw new AppError(422, "ไม่พบผู้รับผิดชอบที่มีสิทธิ");
    if (
      input.status === "ready_to_schedule" &&
      (!input.dataReview ||
        !input.entitlementReview ||
        !["verified", "unable_to_verify"].includes(input.entitlementStatus))
    )
      throw new AppError(422, "กรุณาบันทึกผลตรวจข้อมูลและสิทธิ");
    if (
      input.status === "awaiting_information" &&
      !input.informationRequest?.trim()
    )
      throw new AppError(422, "กรุณาระบุข้อมูลที่ต้องการขอเพิ่ม");
    const previous = r.reviewEncrypted
      ? decrypt<{ contacts?: { at: string; actorId: string; note: string }[] }>(
          r.reviewEncrypted,
        )
      : {};
    await tx.contactRequest.update({
      where: { id: r.id },
      data: {
        status: input.status,
        assignedTo: input.assignedTo || null,
        entitlementStatus: input.entitlementStatus,
        noteEncrypted: encrypt(input.note),
        acceptedAt: null,
        acceptedFingerprint: null,
        acceptedSlotId: null,
        reviewEncrypted: encrypt({
          informationRequest: input.informationRequest ?? "",
          dataReview: input.dataReview,
          entitlementReview: input.entitlementReview,
          contacts: [
            ...(previous.contacts ?? []),
            { at: new Date().toISOString(), actorId, note: input.note },
          ].slice(-100),
        }),
      },
    });
    await audit(tx, actorId, "contact_request.updated", r.id, {
      from: r.status,
      status: input.status,
      entitlementStatus: input.entitlementStatus,
    });
    return { id: r.id, status: input.status };
  });
}
export async function proposeQuote(
  actorId: string,
  id: string,
  packageId: string,
  addonIds: string[],
) {
  const r = await db.contactRequest.findUnique({ where: { id } });
  if (!r) throw new AppError(404, "ไม่พบรายการ");
  const quote = await createQuote(r.sessionId, packageId, addonIds, true);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ContactRequest WHERE id = ${id} FOR UPDATE`;
    const fresh = await tx.contactRequest.findUniqueOrThrow({ where: { id } });
    if (fresh.sessionId !== r.sessionId || fresh.status !== "ready_to_schedule")
      throw new AppError(409, "กรุณาตรวจข้อมูลให้พร้อมนัดก่อน");
    await tx.contactRequest.update({
      where: { id },
      data: {
        quoteId: quote.id,
        acceptedAt: null,
        acceptedFingerprint: null,
        acceptedSlotId: null,
      },
    });
    await audit(tx, actorId, "contact_request.quote_proposed", id, {
      quoteId: quote.id,
    });
    return quote;
  });
}
export async function acceptProposal(
  sessionId: string,
  id: string,
  fingerprint: string,
  slotId: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Session WHERE id = ${sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM ContactRequest WHERE id = ${id} FOR UPDATE`;
    const s = await tx.session.findUnique({ where: { id: sessionId } });
    const r = await tx.contactRequest.findFirst({
      where: { id, sessionId, status: "ready_to_schedule" },
    });
    if (!s?.verifiedPhone || s.expiresAt <= new Date())
      throw new AppError(401, "กรุณายืนยันตัวตน");
    if (!r?.quoteId) throw new AppError(404, "ไม่พบรายการ");
    const q = await tx.quote.findFirst({
      where: {
        id: r.quoteId,
        sessionId,
        fingerprint,
        expiresAt: { gt: new Date() },
      },
    });
    if (!q)
      throw new AppError(
        409,
        "ราคาหมดอายุหรือเปลี่ยนแปลง กรุณาขอราคาใหม่",
        "PRICE_CHANGED",
      );
    if (!(await tx.slot.findUnique({ where: { id: slotId } })))
      throw new AppError(422, "ไม่พบช่วงเวลา");
    await tx.contactRequest.update({
      where: { id },
      data: {
        acceptedAt: new Date(),
        acceptedFingerprint: fingerprint,
        acceptedSlotId: slotId,
      },
    });
    await audit(tx, sessionId, "contact_request.proposal_accepted", id, {
      quoteId: q.id,
      slotId,
    });
    return { accepted: true };
  });
}

export async function submitAdditionalInformation(
  sessionId: string,
  id: string,
  text: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Session WHERE id = ${sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM ContactRequest WHERE id = ${id} FOR UPDATE`;
    const s = await tx.session.findUnique({ where: { id: sessionId } });
    const r = await tx.contactRequest.findFirst({
      where: { id, sessionId, status: "awaiting_information" },
    });
    if (!r || !s?.verifiedPhone || s.expiresAt <= new Date())
      throw new AppError(404, "ไม่พบรายการ");
    const payload = decrypt<{
      person: { phone: string };
      supplements?: { at: string; text: string }[];
    }>(r.payloadEncrypted);
    if (payload.person.phone !== decrypt<string>(s.verifiedPhone))
      throw new AppError(403, "กรุณายืนยันเบอร์เดิม");
    await tx.contactRequest.update({
      where: { id },
      data: {
        status: "under_review",
        acceptedAt: null,
        acceptedFingerprint: null,
        acceptedSlotId: null,
        payloadEncrypted: encrypt({
          ...payload,
          supplements: [
            ...(payload.supplements ?? []),
            { at: new Date().toISOString(), text },
          ].slice(-50),
        }),
      },
    });
    await audit(tx, sessionId, "contact_request.information_submitted", id);
    return { submitted: true };
  });
}
