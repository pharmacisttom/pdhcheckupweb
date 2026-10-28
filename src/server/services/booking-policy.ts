import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, audit, decrypt, encrypt, token } from "@/lib/security";
import { PRIVACY_VERSION } from "@/lib/intake";
import { validateAnswers, type Question } from "@/lib/domain";
import type { Person } from "@/lib/domain";

export async function bookingPolicy() {
  return db.bookingPolicy.findUniqueOrThrow({ where: { id: "default" } });
}

// Shared locks permit concurrent bookings; switching the policy waits for
// already-running mutations and blocks subsequent bookings atomically.
export async function assertOnlineBooking(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM BookingPolicy WHERE id = 'default' FOR SHARE`;
  const policy = await tx.bookingPolicy.findUniqueOrThrow({
    where: { id: "default" },
  });
  if (!policy.onlineEnabled)
    throw new AppError(409, policy.message, "ONLINE_BOOKING_CLOSED");
}

export async function setBookingPolicy(
  actorId: string,
  input: { onlineEnabled: boolean; message: string },
) {
  return db.$transaction(async (tx) => {
    const policy = await tx.bookingPolicy.update({
      where: { id: "default" },
      data: input,
    });
    await audit(tx, actorId, "booking.policy_changed", "default", {
      onlineEnabled: input.onlineEnabled,
    });
    return policy;
  });
}

export async function submitContactRequest(
  sessionId: string,
  input: {
    registrationId: string;
    quoteId?: string;
    interestedPackageId?: string;
    privacyAcknowledged: true;
    noticeVersion?: string;
  },
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM Session WHERE id = ${sessionId} FOR UPDATE`;
      const existing = await tx.contactRequest.findUnique({
        where: { registrationId: input.registrationId },
      });
      if (existing) {
        if (existing.sessionId !== sessionId)
          throw new AppError(404, "ไม่พบข้อมูล");
        return { id: existing.id, reference: existing.reference };
      }
      const identity = await tx.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      if (!identity.verifiedPhone || identity.expiresAt <= new Date())
        throw new AppError(401, "กรุณายืนยันเบอร์โทรศัพท์");
      const registration = await tx.registration.findFirst({
        where: {
          id: input.registrationId,
          ownerSessionId: sessionId,
          expiresAt: { gt: new Date() },
          booking: null,
        },
      });
      const quote = input.quoteId
        ? await tx.quote.findFirst({
            where: {
              id: input.quoteId,
              sessionId,
              expiresAt: { gt: new Date() },
            },
          })
        : null;
      if (!registration || (input.quoteId && !quote))
        throw new AppError(
          409,
          "ข้อมูลหรือราคาประมาณการหมดอายุ กรุณาตรวจสอบอีกครั้ง",
        );
      const person = decrypt<Person>(registration.draftEncrypted);
      if (person.phone !== decrypt<string>(identity.verifiedPhone))
        throw new AppError(422, "เบอร์โทรศัพท์ไม่ตรงกับเบอร์ที่ยืนยัน");
      if (
        (person.intakeVersion === 2 || input.noticeVersion) &&
        input.noticeVersion !== PRIVACY_VERSION
      )
        throw new AppError(
          409,
          "กรุณารับทราบประกาศฉบับปัจจุบัน",
          "NOTICE_CHANGED",
        );
      const questionnaire = await tx.questionnaire.findFirst({
        where: {
          version: registration.questionnaireVersion,
          status: "published",
          approvedBy: { not: null },
        },
      });
      if (
        !questionnaire ||
        !registration.assessmentEncrypted ||
        validateAnswers(
          questionnaire.questions as Question[],
          decrypt(registration.assessmentEncrypted),
        ).length
      )
        throw new AppError(
          422,
          "กรุณาตอบแบบประเมินให้ครบถ้วน",
          "VALIDATION_ERROR",
        );
      const interest = input.interestedPackageId
        ? await tx.package.findFirst({
            where: {
              id: input.interestedPackageId,
              status: "published",
              approvedBy: { not: null },
            },
            select: { id: true, name: true, version: true },
          })
        : null;
      if (input.interestedPackageId && !interest)
        throw new AppError(422, "กรุณาเลือกแพ็กเกจที่เผยแพร่แล้ว");
      const request = await tx.contactRequest.create({
        data: {
          reference: "PDH-C-" + token().slice(0, 12).toUpperCase(),
          sessionId,
          registrationId: registration.id,
          status: "submitted",
          quoteId: quote?.id,
          payloadEncrypted: encrypt({
            person,
            interestedPackage: interest,
            answers: registration.assessmentEncrypted
              ? decrypt(registration.assessmentEncrypted)
              : {},
            questionnaireVersion: registration.questionnaireVersion,
            estimate: quote?.snapshot ?? null,
            total: quote?.total.toFixed(2) ?? null,
          }),
        },
      });
      await tx.hold.updateMany({
        where: { sessionId, consumed: false },
        data: { expiresAt: new Date() },
      });
      await tx.privacyRecord.create({
        data: {
          sessionId,
          noticeVersion: input.noticeVersion ?? "draft-v1",
          purpose: "staff_contact_for_appointment",
        },
      });
      await audit(tx, sessionId, "contact_request.submitted", request.id);
      return { id: request.id, reference: request.reference };
    },
    { isolationLevel: "ReadCommitted" },
  );
}
