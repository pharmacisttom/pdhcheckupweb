import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { AppError, audit, decrypt } from "@/lib/security";
import type { Person } from "@/lib/domain";

/**
 * RC02: reclaim a saved, unsubmitted registration from a different browser.
 * A current OTP-verified phone and the correct birthdate are both required.
 * Saved drafts can be older than their transactional expiresAt; confirmed
 * bookings and submitted contact requests have separate recovery flows.
 */
export async function recoverRegistrationDraft(
  currentSessionId: string,
  registrationId: string,
  birthdate: string,
) {
  const generic = () =>
    new AppError(404, "ไม่พบรายการที่ตรงกับข้อมูลยืนยัน", "RECOVERY_NOT_FOUND");

  return db.$transaction(async (tx) => {
    // Lock registration first so concurrent submissions/recoveries do not
    // race a change in ownership.
    await tx.$queryRaw`SELECT id FROM Registration WHERE id = ${registrationId} FOR UPDATE`;
    const registration = await tx.registration.findUnique({
      where: { id: registrationId },
    });
    if (!registration) throw generic();

    const session = await tx.session.findUnique({
      where: { id: currentSessionId },
    });
    if (!session?.verifiedPhone || session.expiresAt <= new Date())
      throw generic();

    const [contact, booking] = await Promise.all([
      tx.contactRequest.findUnique({
        where: { registrationId },
        select: { id: true },
      }),
      tx.booking.findUnique({
        where: { registrationId },
        select: { id: true },
      }),
    ]);
    if (contact || booking) throw generic();

    const person = decrypt<Person>(registration.draftEncrypted);
    const phone = decrypt<string>(session.verifiedPhone);
    if (person.phone !== phone || person.birthdate !== birthdate)
      throw generic();

    await tx.registration.update({
      where: { id: registrationId },
      data: { ownerSessionId: currentSessionId },
    });
    await audit(
      tx,
      currentSessionId,
      "registration.draft_recovered",
      registrationId,
      {},
      randomUUID(),
    );
    return { recovered: true };
  });
}
