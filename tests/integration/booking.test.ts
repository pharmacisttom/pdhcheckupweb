import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { db } from "../../src/lib/db";
import { encrypt } from "../../src/lib/security";
import { createQuote } from "../../src/server/services/pricing";
import {
  setBookingPolicy,
  submitContactRequest,
} from "../../src/server/services/booking-policy";
import { availableSlots } from "../../src/server/services/availability";
import {
  confirmBooking,
  createHold,
  rescheduleBooking,
} from "../../src/server/services/appointments";
const enabled = process.env.RUN_DB_TESTS === "true";
describe.skipIf(!enabled)(
  "real transaction end-to-end confirmation and idempotency",
  () => {
    let slotId: string;
    let dayId: string;
    let packageId: string;
    let serviceId: string;
    let questionnaireId: string;
    const owners: {
      sessionId: string;
      registrationId: string;
      quoteId: string;
      fingerprint: string;
    }[] = [];
    const marker = crypto.randomUUID();
    beforeAll(async () => {
      if (!process.env.DATABASE_URL?.includes("pdh_healthcheck_test"))
        throw new Error("Isolated test database required");
      const qv = Math.floor(Date.now() / 1000);
      const q = await db.questionnaire.create({
        data: {
          version: qv,
          questions: [],
          rules: [],
          status: "published",
          approvedBy: "test",
        },
      });
      questionnaireId = q.id;
      const svc = await db.service.create({
        data: {
          code: "T-" + marker,
          nameTh: "บริการทดสอบ",
          nameEn: "Test",
          category: "test",
          componentCodes: [],
        },
      });
      serviceId = svc.id;
      const pkg = await db.package.create({
        data: {
          key: "T-" + marker,
          version: 1,
          name: "Test package",
          description: "Synthetic test",
          audience: "Test",
          fixedPrice: "123.45",
          preparation: "Test",
          status: "published",
          approvedBy: "test",
          effectiveFrom: new Date("2020-01-01"),
          items: { create: { serviceId, position: 0 } },
        },
      });
      packageId = pkg.id;
      const when = new Date(Date.now() + 100 * 86400000);
      dayId = when.toISOString().slice(0, 10);
      await db.dayCapacity.create({ data: { id: dayId, capacity: 1 } });
      slotId = (
        await db.slot.create({
          data: {
            dayId,
            startsAt: when,
            endsAt: new Date(when.getTime() + 3600000),
            capacity: 1,
          },
        })
      ).id;
      for (let i = 0; i < 20; i++) {
        const phone = "+668" + String(10000000 + i);
        const person = {
          firstName: "Test" + i,
          lastName: marker,
          birthdate: "1990-01-01",
          phone,
          documentType: "none",
          contactChannel: "sms",
        };
        const s = await db.session.create({
          data: {
            tokenHash:
              crypto.randomUUID().replaceAll("-", "") +
              crypto.randomUUID().replaceAll("-", ""),
            verifiedPhone: encrypt(phone),
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        const r = await db.registration.create({
          data: {
            ownerSessionId: s.id,
            draftEncrypted: encrypt(person),
            assessmentEncrypted: encrypt({}),
            questionnaireVersion: qv,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        const quote = await createQuote(s.id, packageId, []);
        owners.push({
          sessionId: s.id,
          registrationId: r.id,
          quoteId: quote.id,
          fingerprint: quote.fingerprint,
        });
      }
    }, 30000);
    afterAll(async () => {
      const sessions = owners.map((o) => o.sessionId);
      const bookings = await db.booking.findMany({
        where: { sessionId: { in: sessions } },
      });
      const regs = await db.registration.findMany({
        where: { ownerSessionId: { in: sessions } },
      });
      await db.invoice.deleteMany({
        where: { bookingId: { in: bookings.map((b) => b.id) } },
      });
      await db.notification.deleteMany({
        where: { dedupKey: { in: bookings.map((b) => b.id + ":confirmed") } },
      });
      await db.booking.deleteMany({ where: { sessionId: { in: sessions } } });
      await db.contactRequest.deleteMany({
        where: { sessionId: { in: sessions } },
      });
      await db.privacyRecord.deleteMany({
        where: { sessionId: { in: sessions } },
      });
      await db.audit.deleteMany({ where: { actorId: { in: sessions } } });
      await db.registration.deleteMany({
        where: { ownerSessionId: { in: sessions } },
      });
      await db.patient.deleteMany({
        where: {
          id: { in: regs.flatMap((r) => (r.patientId ? [r.patientId] : [])) },
        },
      });
      await db.quote.deleteMany({ where: { sessionId: { in: sessions } } });
      await db.hold.deleteMany({ where: { sessionId: { in: sessions } } });
      await db.session.deleteMany({ where: { id: { in: sessions } } });
      if (slotId) await db.slot.delete({ where: { id: slotId } });
      if (dayId) await db.dayCapacity.delete({ where: { id: dayId } });
      if (packageId) {
        await db.packageItem.deleteMany({ where: { packageId } });
        await db.package.delete({ where: { id: packageId } });
      }
      if (serviceId) await db.service.delete({ where: { id: serviceId } });
      if (questionnaireId)
        await db.questionnaire.delete({ where: { id: questionnaireId } });
      await db.$disconnect();
    });
    it("20 simultaneous hold-and-confirm requests create exactly one booking; duplicate confirmation is stable", async () => {
      let winning:
        | { sessionId: string; input: Parameters<typeof confirmBooking>[1] }
        | undefined;
      const results = await Promise.allSettled(
        owners.map(async (owner) => {
          const hold = await createHold(owner.sessionId, slotId);
          const input = {
            registrationId: owner.registrationId,
            quoteId: owner.quoteId,
            fingerprint: owner.fingerprint,
            holdId: hold.id,
            idempotencyKey: crypto.randomUUID(),
            privacyAcknowledged: true as const,
          };
          const result = await confirmBooking(owner.sessionId, input);
          winning = { sessionId: owner.sessionId, input };
          return result;
        }),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await db.booking.count({ where: { slotId, status: "confirmed" } }),
      ).toBe(1);
      expect(winning).toBeDefined();
      const repeat = await Promise.all(
        Array.from({ length: 10 }, () =>
          confirmBooking(winning!.sessionId, winning!.input),
        ),
      );
      expect(new Set(repeat.map((r) => r.id)).size).toBe(1);
      const saved = await db.booking.findUniqueOrThrow({
        where: { id: repeat[0].id },
        include: { quote: true },
      });
      expect(saved.quote.total.toFixed(2)).toBe("123.45");
      expect(await db.invoice.count({ where: { bookingId: saved.id } })).toBe(
        1,
      );
      expect(
        await db.audit.count({
          where: { resourceId: saved.id, action: "booking.confirmed" },
        }),
      ).toBe(1);
    }, 60000);
    it("blocks direct online mutations when closed but accepts an owned, verified callback exactly once", async () => {
      const before = await db.bookingPolicy.findUniqueOrThrow({
        where: { id: "default" },
      });
      const owner = owners.find(
        (o) => o.sessionId !== undefined && o !== owners[0],
      )!;
      // Choose a registration without a confirmed booking.
      const unused = await db.registration.findFirstOrThrow({
        where: {
          ownerSessionId: { in: owners.map((o) => o.sessionId) },
          booking: null,
        },
      });
      const candidate = owners.find((o) => o.registrationId === unused.id)!;
      try {
        await setBookingPolicy("policy-test", {
          onlineEnabled: false,
          message: "ปิดทดสอบ กรุณาให้เจ้าหน้าที่นัด",
        });
        await expect(createHold(owner.sessionId, slotId)).rejects.toMatchObject(
          { code: "ONLINE_BOOKING_CLOSED" },
        );
        await expect(
          confirmBooking(candidate.sessionId, {
            registrationId: candidate.registrationId,
            quoteId: candidate.quoteId,
            fingerprint: candidate.fingerprint,
            holdId: "stale-hold",
            idempotencyKey: crypto.randomUUID(),
            privacyAcknowledged: true,
          }),
        ).rejects.toMatchObject({ code: "ONLINE_BOOKING_CLOSED" });
        await expect(
          rescheduleBooking(
            candidate.sessionId,
            "old-booking",
            slotId,
            crypto.randomUUID(),
          ),
        ).rejects.toMatchObject({ code: "ONLINE_BOOKING_CLOSED" });
        expect(await availableSlots(new Date())).toEqual([]);
        const input = {
          registrationId: candidate.registrationId,
          quoteId: candidate.quoteId,
          privacyAcknowledged: true as const,
        };
        const first = await submitContactRequest(candidate.sessionId, input);
        expect(await submitContactRequest(candidate.sessionId, input)).toEqual(
          first,
        );
        expect(
          await db.contactRequest.count({
            where: { registrationId: candidate.registrationId },
          }),
        ).toBe(1);
        await expect(
          submitContactRequest(
            owners.find((o) => o.sessionId !== candidate.sessionId)!.sessionId,
            input,
          ),
        ).rejects.toMatchObject({ status: 404 });
        expect(
          await db.booking.count({
            where: { registrationId: candidate.registrationId },
          }),
        ).toBe(0);
        expect(
          await db.contactRequest.findUniqueOrThrow({
            where: { id: first.id },
          }),
        ).toMatchObject({ status: "submitted" });
      } finally {
        await setBookingPolicy("policy-test", {
          onlineEnabled: before.onlineEnabled,
          message: before.message,
        });
        await db.audit.deleteMany({ where: { actorId: "policy-test" } });
      }
    });
  },
);
