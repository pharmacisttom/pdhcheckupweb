import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, audit, decrypt, encrypt, token } from "@/lib/security";
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
  input: { registrationId: string; quoteId: string; privacyAcknowledged: true },
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
      const quote = await tx.quote.findFirst({
        where: { id: input.quoteId, sessionId, expiresAt: { gt: new Date() } },
      });
      if (!registration || !quote)
        throw new AppError(
          409,
          "ข้อมูลหรือราคาประมาณการหมดอายุ กรุณาตรวจสอบอีกครั้ง",
        );
      const person = decrypt<Person>(registration.draftEncrypted);
      if (person.phone !== decrypt<string>(identity.verifiedPhone))
        throw new AppError(422, "เบอร์โทรศัพท์ไม่ตรงกับเบอร์ที่ยืนยัน");
      const request = await tx.contactRequest.create({
        data: {
          reference: "PDH-C-" + token().slice(0, 12).toUpperCase(),
          sessionId,
          registrationId: registration.id,
          payloadEncrypted: encrypt({
            person,
            answers: registration.assessmentEncrypted
              ? decrypt(registration.assessmentEncrypted)
              : {},
            questionnaireVersion: registration.questionnaireVersion,
            estimate: quote.snapshot,
            total: quote.total.toFixed(2),
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
          noticeVersion: "draft-v1",
          purpose: "staff_contact_for_appointment",
        },
      });
      await audit(tx, sessionId, "contact_request.submitted", request.id);
      return { id: request.id, reference: request.reference };
    },
    { isolationLevel: "ReadCommitted" },
  );
}
