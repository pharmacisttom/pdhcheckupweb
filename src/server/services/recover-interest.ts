import { otpRequired } from "./contact-verification";
import { db } from "@/lib/db";
import { AppError, audit, decrypt } from "@/lib/security";
import type { Person } from "@/lib/domain";
export async function recoverInterest(
  sessionId: string,
  reference: string,
  birthdate: string,
) {
  if (!otpRequired())
    throw new AppError(
      503,
      "กรุณาติดต่อเจ้าหน้าที่เพื่อยืนยันตัวตน",
      "OTP_DISABLED",
    );
  const request = await db.contactRequest.findUnique({ where: { reference } });
  const booking = request
    ? null
    : await db.booking.findUnique({
        where: { reference },
        include: { registration: true },
      });
  const record = request ?? booking;
  if (!record) throw new AppError(404, "ไม่พบรายการที่ตรงกับข้อมูลยืนยัน");
  return db.$transaction(async (tx) => {
    for (const id of [...new Set([sessionId, record.sessionId])].sort())
      await tx.$queryRaw`SELECT id FROM Session WHERE id = ${id} FOR UPDATE`;
    const linked = await tx.contactRequest.findUnique({
      where: { registrationId: record.registrationId },
    });
    if (linked)
      await tx.$queryRaw`SELECT id FROM ContactRequest WHERE id = ${linked.id} FOR UPDATE`;
    const registration = await tx.registration.findUnique({
      where: { id: record.registrationId },
    });
    if (!registration || registration.ownerSessionId !== record.sessionId)
      throw new AppError(409, "กรุณาลองยืนยันตัวตนใหม่");
    const s = await tx.session.findUnique({ where: { id: sessionId } });
    const person = decrypt<Person>(registration.draftEncrypted);
    if (
      !s?.verifiedPhone ||
      s.expiresAt <= new Date() ||
      person.phone !== decrypt<string>(s.verifiedPhone) ||
      person.birthdate !== birthdate
    )
      throw new AppError(404, "ไม่พบรายการที่ตรงกับข้อมูลยืนยัน");
    if (linked)
      await tx.contactRequest.update({
        where: { id: linked.id },
        data: { sessionId },
      });
    await tx.registration.update({
      where: { id: registration.id },
      data: { ownerSessionId: sessionId },
    });
    const quoteIds = [linked?.quoteId, booking?.quoteId].filter(
      (id): id is string => !!id,
    );
    await tx.quote.updateMany({
      where: { id: { in: quoteIds } },
      data: { sessionId },
    });
    await tx.booking.updateMany({
      where: { registrationId: registration.id },
      data: { sessionId },
    });
    await audit(
      tx,
      sessionId,
      "registration.identity_recovered",
      registration.id,
    );
    return { recovered: true };
  });
}
