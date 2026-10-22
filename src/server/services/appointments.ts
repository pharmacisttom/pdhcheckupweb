import { db } from "@/lib/db";
import {
  AppError,
  audit,
  encrypt,
  hash,
  token,
  decrypt,
  privateHash,
} from "@/lib/security";
import {
  activeStatuses,
  bangkokDate,
  ageOn,
  canTransition,
  fingerprint,
  type Person,
  validateAnswers,
  evaluateRules,
  type Question,
  type RiskRule,
} from "@/lib/domain";
import { currentPackage, quoteSnapshot } from "./pricing";
import type { Prisma } from "@prisma/client";
import { assertOnlineBooking } from './booking-policy';
type DB = Prisma.TransactionClient;
async function lockSlot(tx: DB, slotId: string) {
  const slot = await tx.slot.findUnique({ where: { id: slotId } });
  if (!slot) throw new AppError(404, "ไม่พบช่วงเวลา");
  // All capacity mutations acquire the day lock first, then slot lock.
  await tx.$queryRaw`SELECT id FROM DayCapacity WHERE id = ${slot.dayId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM Slot WHERE id = ${slotId} FOR UPDATE`;
  const day = await tx.dayCapacity.findUniqueOrThrow({
    where: { id: slot.dayId },
  });
  if (
    day.blackout ||
    slot.closed ||
    slot.startsAt.getTime() < Date.now() + 24 * 3600000
  )
    throw new AppError(
      409,
      "ช่วงเวลานี้ไม่เปิดรับจอง (ต้องล่วงหน้าอย่างน้อย 24 ชั่วโมง)",
    );
  return { slot, day };
}
async function checkCapacity(tx: DB, slotId: string, ownHoldId?: string, excludeBookingId?: string) {
  const { slot, day } = await lockSlot(tx, slotId);
  const now = new Date();
  const [booked, held, dailyBookings, dailyHolds] = await Promise.all([
    tx.booking.count({ where: { slotId, status: { in: activeStatuses }, ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) } }),
    tx.hold.count({
      where: {
        slotId,
        consumed: false,
        expiresAt: { gt: now },
        ...(ownHoldId ? { id: { not: ownHoldId } } : {}),
      },
    }),
    tx.booking.count({
      where: { slot: { dayId: slot.dayId }, status: { in: activeStatuses }, ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) },
    }),
    tx.hold.count({
      where: {
        slot: { dayId: slot.dayId },
        consumed: false,
        expiresAt: { gt: now },
        ...(ownHoldId ? { id: { not: ownHoldId } } : {}),
      },
    }),
  ]);
  if (
    booked + held >= slot.capacity - slot.reservedCapacity ||
    dailyBookings + dailyHolds >= day.capacity
  )
    throw new AppError(
      409,
      "ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น",
      "CAPACITY_FULL",
    );
  return slot;
}
export async function createHold(sessionId: string, slotId: string) {
  return db.$transaction(
    async (tx) => {
      await assertOnlineBooking(tx);
      // Serializes holds for one session without reversing the day/slot lock order.
      await tx.$queryRaw`SELECT id FROM Session WHERE id = ${sessionId} FOR UPDATE`;
      await tx.hold.updateMany({
        where: { sessionId, consumed: false },
        data: { expiresAt: new Date() },
      });
      await checkCapacity(tx, slotId);
      return tx.hold.create({
        data: {
          sessionId,
          slotId,
          expiresAt: new Date(Date.now() + 5 * 60000),
        },
      });
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}
export type ConfirmInput = {
  registrationId: string;
  holdId: string;
  quoteId: string;
  fingerprint: string;
  idempotencyKey: string;
  privacyAcknowledged: true;
};
export async function confirmBooking(sessionId: string, input: ConfirmInput) {
  return db.$transaction(
    async (tx) => {
      await assertOnlineBooking(tx);
      await tx.$queryRaw`SELECT id FROM Session WHERE id = ${sessionId} FOR UPDATE`;
      const requestHash = fingerprint(input);
      const existing = await tx.booking.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.sessionId !== sessionId ||
          existing.requestHash !== requestHash
        )
          throw new AppError(409, "Idempotency key ถูกใช้กับคำขออื่น");
        return { id: existing.id, reference: existing.reference };
      }
      const identity = await tx.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      if (!identity.verifiedPhone || identity.expiresAt < new Date())
        throw new AppError(401, "กรุณายืนยันเบอร์โทรศัพท์");
      const registration = await tx.registration.findFirst({
        where: {
          id: input.registrationId,
          ownerSessionId: sessionId,
          expiresAt: { gt: new Date() },
        },
      });
      const quote = await tx.quote.findFirst({
        where: { id: input.quoteId, sessionId, expiresAt: { gt: new Date() } },
      });
      const hold = await tx.hold.findFirst({
        where: {
          id: input.holdId,
          sessionId,
          consumed: false,
          expiresAt: { gt: new Date() },
        },
      });
      if (!registration || !quote || !hold)
        throw new AppError(
          409,
          "ข้อมูล ราคารวม หรือเวลาที่สำรองหมดอายุ กรุณาตรวจสอบอีกครั้ง",
        );
      const person = decrypt<Person>(registration.draftEncrypted);
      if (person.phone !== decrypt<string>(identity.verifiedPhone))
        throw new AppError(422, "เบอร์โทรศัพท์ไม่ตรงกับเบอร์ที่ยืนยัน");
      const questionnaire = await tx.questionnaire.findFirst({
        where: {
          version: registration.questionnaireVersion,
          status: "published",
          approvedBy: { not: null },
        },
      });
      if (!questionnaire || !registration.assessmentEncrypted)
        throw new AppError(422, "กรุณาตอบแบบประเมินที่ได้รับอนุมัติ");
      const answers = decrypt<Record<string, unknown>>(
        registration.assessmentEncrypted,
      );
      if (
        validateAnswers(questionnaire.questions as Question[], answers).length
      )
        throw new AppError(422, "แบบประเมินยังไม่ครบถ้วน");
      const decisions = evaluateRules(
        questionnaire.rules as RiskRule[],
        answers,
        questionnaire.version,
      );
      if (
        decisions.some((d) =>
          [
            "needs_clinical_review",
            "not_eligible_for_specific_service",
            "safety_warning",
          ].includes(d.decision),
        )
      )
        throw new AppError(
          422,
          "กรุณาติดต่อเจ้าหน้าที่เพื่อประเมินก่อนจอง",
          "CLINICAL_REVIEW",
        );
      const pkg = await currentPackage(quote.packageId, tx);
      const age = ageOn(person.birthdate);
      if (age < pkg.minAge || age > pkg.maxAge)
        throw new AppError(422, "อายุไม่ตรงกับเงื่อนไขแพ็กเกจ");
      const previous = quote.snapshot as {
        lines: { id: string; code: string }[];
      };
      const snapshot = await quoteSnapshot(
        quote.packageId,
        previous.lines.filter((l) => l.code !== "PACKAGE").map((l) => l.id),
        tx,
      );
      if (
        fingerprint(snapshot) !== quote.fingerprint ||
        quote.fingerprint !== input.fingerprint
      )
        throw new AppError(
          409,
          "ราคาเปลี่ยนแปลง กรุณารับทราบราคาใหม่",
          "PRICE_CHANGED",
        );
      await checkCapacity(tx, hold.slotId, hold.id);
      const checkToken = token();
      // A keyed identifier prevents accidental duplicate registrations without leaking existence.
      const identityHash = person.identifier
        ? privateHash(person.documentType + ":" + person.identifier)
        : privateHash(
            person.phone +
              ":" +
              person.birthdate +
              ":" +
              person.firstName +
              ":" +
              person.lastName,
          );
      const patient = await tx.patient.upsert({
        where: { identityHash },
        create: { identityHash, detailsEncrypted: encrypt(person) },
        update: {},
      });
      const slot = await tx.slot.findUniqueOrThrow({
        where: { id: hold.slotId },
      });
      const duplicate = await tx.booking.findFirst({
        where: {
          registration: { patientId: patient.id },
          slot: { dayId: slot.dayId },
          status: { in: activeStatuses },
        },
      });
      if (duplicate)
        throw new AppError(
          409,
          "ไม่สามารถยืนยันรายการนี้ กรุณาติดต่อเจ้าหน้าที่",
        );
      await tx.registration.update({
        where: { id: registration.id },
        data: { patientId: patient.id },
      });
      const booking = await tx.booking.create({
        data: {
          reference: "PDH-" + token().slice(0, 12).toUpperCase(),
          registrationId: registration.id,
          sessionId,
          slotId: hold.slotId,
          quoteId: quote.id,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          checkInTokenHash: hash(checkToken),
          checkInTokenEncrypted: encrypt(checkToken),
        },
      });
      await tx.hold.update({
        where: { id: hold.id },
        data: { consumed: true },
      });
      await tx.invoice.create({
        data: { bookingId: booking.id, estimatedAmount: quote.total },
      });
      await tx.privacyRecord.create({
        data: {
          sessionId,
          noticeVersion: "draft-v1",
          purpose: "registration_notice_acknowledgement",
        },
      });
      await tx.notification.create({
        data: {
          event: "booking.confirmed",
          dedupKey: booking.id + ":confirmed",
          payloadEncrypted: encrypt({ bookingId: booking.id }),
        },
      });
      await audit(tx, sessionId, "booking.confirmed", booking.id, {
        quoteId: quote.id,
        slotId: hold.slotId,
      });
      return { id: booking.id, reference: booking.reference };
    },
    { isolationLevel: "ReadCommitted", timeout: 20000 },
  );
}
export async function rescheduleBooking(sessionId: string, bookingId: string, slotId: string, idempotencyKey: string) {
  return db.$transaction(async tx => {
    await assertOnlineBooking(tx);
    await tx.$queryRaw`SELECT id FROM Session WHERE id = ${sessionId} FOR UPDATE`;
    const requestHash = fingerprint({ bookingId, slotId });
    const previous = await tx.bookingChange.findUnique({ where: { idempotencyKey } });
    if (previous) {
      if (previous.sessionId !== sessionId || previous.requestHash !== requestHash) throw new AppError(409, 'Idempotency key ถูกใช้กับคำขออื่น');
      return { id: bookingId, slotId: previous.newSlotId };
    }
    const booking = await tx.booking.findFirst({ where: { id: bookingId, sessionId }, include: { slot: true } });
    const target = await tx.slot.findUnique({ where: { id: slotId } });
    if (!booking || !target) throw new AppError(404, 'ไม่พบรายการ');
    for (const dayId of [...new Set([booking.slot.dayId, target.dayId])].sort()) await tx.$queryRaw`SELECT id FROM DayCapacity WHERE id = ${dayId} FOR UPDATE`;
    for (const id of [...new Set([booking.slotId, slotId])].sort()) await tx.$queryRaw`SELECT id FROM Slot WHERE id = ${id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM Booking WHERE id = ${bookingId} FOR UPDATE`;
    const fresh = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (fresh.status !== 'confirmed' || fresh.slotId !== booking.slotId || booking.slot.startsAt.getTime() < Date.now() + 86400000) throw new AppError(409, 'เลื่อนนัดได้เฉพาะนัดที่ยืนยันและล่วงหน้าอย่างน้อย 24 ชั่วโมง');
    if (slotId === booking.slotId) throw new AppError(422, 'กรุณาเลือกช่วงเวลาใหม่');
    await checkCapacity(tx, slotId, undefined, bookingId);
    await tx.booking.update({ where: { id: bookingId }, data: { slotId } });
    const change = await tx.bookingChange.create({ data: { bookingId, sessionId, idempotencyKey, requestHash, previousSlotId: booking.slotId, newSlotId: slotId } });
    await tx.notification.create({ data: { event: 'booking.rescheduled', dedupKey: change.id, payloadEncrypted: encrypt({ bookingId }) } });
    await audit(tx, sessionId, 'booking.rescheduled', bookingId, { previousSlotId: booking.slotId, newSlotId: slotId });
    return { id: bookingId, slotId };
  }, { isolationLevel: 'ReadCommitted', timeout: 20000 });
}

export async function transitionBooking(
  id: string,
  to: string,
  actorId: string,
  reason?: string,
  ownerSessionId?: string,
) {
  return db.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id } });
      if (!booking || (ownerSessionId && booking.sessionId !== ownerSessionId))
        throw new AppError(404, "ไม่พบรายการ");
      const slot = await tx.slot.findUniqueOrThrow({
        where: { id: booking.slotId },
      });
      await tx.$queryRaw`SELECT id FROM DayCapacity WHERE id = ${slot.dayId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM Booking WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.booking.findUniqueOrThrow({ where: { id } });
      if (!canTransition(fresh.status, to))
        throw new AppError(409, "ไม่สามารถเปลี่ยนสถานะนี้ได้");
      if (to === 'checked_in' && bangkokDate(slot.startsAt) !== bangkokDate(new Date())) throw new AppError(409, 'เช็กอินได้เฉพาะวันนัดหมาย');
      if (to === 'no_show' && slot.endsAt > new Date()) throw new AppError(409, 'บันทึกไม่มาตามนัดได้หลังสิ้นสุดช่วงเวลานัด');
      if (to === "cancelled" && !reason?.trim())
        throw new AppError(422, "กรุณาระบุเหตุผล");
      if (
        ownerSessionId &&
        (to !== "cancelled" ||
          slot.startsAt.getTime() < Date.now() + 24 * 3600000)
      )
        throw new AppError(409, "กรุณาติดต่อเจ้าหน้าที่เพื่อเปลี่ยนแปลงนัด");
      await tx.booking.update({
        where: { id },
        data: {
          status: to,
          cancellationReason: reason,
          ...(to === "checked_in" ? { checkedInAt: new Date() } : {}),
        },
      });
      await audit(tx, actorId, "booking." + to, id);
      return { id, status: to };
    },
    { isolationLevel: "ReadCommitted" },
  );
}
