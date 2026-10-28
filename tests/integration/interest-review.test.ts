import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { db } from "../../src/lib/db";
import { decrypt, encrypt } from "../../src/lib/security";
import {
  submitContactRequest,
  setBookingPolicy,
} from "../../src/server/services/booking-policy";
import {
  acceptProposal,
  proposeQuote,
  updateReview,
  reviewInput,
  submitAdditionalInformation,
} from "../../src/server/services/interest-review";
import { confirmReviewedBooking } from "../../src/server/services/appointments";
import { recoverInterest } from "../../src/server/services/recover-interest";
import { PRIVACY_VERSION } from "../../src/lib/intake";
const enabled = process.env.RUN_DB_TESTS === "true";
describe.skipIf(!enabled)(
  "interest review with real isolated MySQL transactions",
  () => {
    const marker = crypto.randomUUID();
    let qv: number;
    let packageId: string;
    let slotId: string;
    let dayId: string;
    let original: { onlineEnabled: boolean; message: string };
    const sessions: string[] = [];
    const registrations: string[] = [];
    const contacts: string[] = [];
    const person = {
      firstName: "Synthetic",
      lastName: marker,
      birthdate: "1990-01-01",
      phone: "+66812345678",
      sex: "female",
      treatmentRight: "unknown",
      medicalHistory: "Unknown",
      surgeryHistory: "None",
      currentMedication: "None",
      allergies: "Unknown",
      familyNcdStatus: "unknown",
      locale: "en",
    };
    async function owner() {
      const s = await db.session.create({
        data: {
          tokenHash:
            crypto.randomUUID().replaceAll("-", "") +
            crypto.randomUUID().replaceAll("-", ""),
          verifiedPhone: encrypt(person.phone),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      sessions.push(s.id);
      const r = await db.registration.create({
        data: {
          ownerSessionId: s.id,
          draftEncrypted: encrypt(person),
          assessmentEncrypted: encrypt({ review: "yes" }),
          questionnaireVersion: qv,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      registrations.push(r.id);
      return { s, r };
    }
    async function submit(o: Awaited<ReturnType<typeof owner>>) {
      const r = await submitContactRequest(o.s.id, {
        registrationId: o.r.id,
        privacyAcknowledged: true,
        noticeVersion: PRIVACY_VERSION,
      });
      contacts.push(r.id);
      return r;
    }
    async function ready(id: string) {
      await updateReview(marker, {
        id,
        status: "under_review",
        note: "Contact log",
        entitlementStatus: "pending",
        dataReview: "",
        entitlementReview: "",
      });
      await updateReview(marker, {
        id,
        status: "ready_to_schedule",
        note: "Patient contacted",
        entitlementStatus: "unable_to_verify",
        dataReview: "Reviewed by staff",
        entitlementReview: "Coverage cannot be verified; self-pay discussed",
      });
    }
    beforeAll(async () => {
      const u = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1"].includes(u.hostname) ||
        u.pathname != "/pdh_healthcheck_test"
      )
        throw Error("Isolated test DB only");
      original = await db.bookingPolicy.findUniqueOrThrow({
        where: { id: "default" },
      });
      qv = Math.floor(Date.now() / 1000) + 300;
      await db.questionnaire.create({
        data: {
          version: qv,
          status: "published",
          approvedBy: marker,
          questions: [
            {
              id: "review",
              label: "Review question",
              type: "single",
              options: ["yes"],
              required: true,
            },
          ],
          rules: [
            {
              id: "review",
              field: "review",
              equals: "yes",
              decision: "needs_clinical_review",
              reason: "Synthetic review",
            },
          ],
        },
      });
      packageId = (
        await db.package.create({
          data: {
            key: marker,
            version: 1,
            name: "Synthetic package",
            description: "Test only",
            audience: "Test",
            fixedPrice: "100.00",
            preparation: "Synthetic preparation",
            status: "published",
            approvedBy: marker,
            effectiveFrom: new Date("2020-01-01"),
          },
        })
      ).id;
      const when = new Date(Date.now() + 120 * 86400000);
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
    }, 30000);
    afterAll(async () => {
      if (original) await setBookingPolicy(marker, original);
      const bookings = await db.booking.findMany({
        where: { registrationId: { in: registrations } },
      });
      const ids = bookings.map((b) => b.id);
      const regs = await db.registration.findMany({
        where: { id: { in: registrations } },
      });
      await db.invoice.deleteMany({ where: { bookingId: { in: ids } } });
      await db.notification.deleteMany({
        where: { dedupKey: { in: ids.map((id) => id + ":confirmed") } },
      });
      await db.booking.deleteMany({ where: { id: { in: ids } } });
      await db.contactRequest.deleteMany({ where: { id: { in: contacts } } });
      await db.registration.deleteMany({
        where: { id: { in: registrations } },
      });
      await db.patient.deleteMany({
        where: {
          id: { in: regs.flatMap((r) => (r.patientId ? [r.patientId] : [])) },
        },
      });
      await db.quote.deleteMany({ where: { sessionId: { in: sessions } } });
      await db.privacyRecord.deleteMany({
        where: { sessionId: { in: sessions } },
      });
      await db.audit.deleteMany({
        where: {
          OR: [
            { actorId: marker },
            { actorId: { in: sessions } },
            { resourceId: { in: contacts } },
          ],
        },
      });
      await db.session.deleteMany({ where: { id: { in: sessions } } });
      if (slotId) await db.slot.delete({ where: { id: slotId } });
      if (dayId) await db.dayCapacity.delete({ where: { id: dayId } });
      if (packageId) await db.package.delete({ where: { id: packageId } });
      if (qv) await db.questionnaire.deleteMany({ where: { version: qv } });
      await db.$disconnect();
    });
    it("accepts clinical-review interest without package, deduplicates concurrent submissions and enforces ownership", async () => {
      const o = await owner(),
        other = await owner();
      await expect(
        submitContactRequest(other.s.id, {
          registrationId: o.r.id,
          privacyAcknowledged: true,
        }),
      ).rejects.toThrow();
      const results = await Promise.all([submit(o), submit(o)]);
      expect(results[0].id).toBe(results[1].id);
      expect(
        await db.contactRequest.count({ where: { registrationId: o.r.id } }),
      ).toBe(1);
      const stored = await db.contactRequest.findUniqueOrThrow({
        where: { id: results[0].id },
      });
      expect(stored.status).toBe("submitted");
      expect(stored.quoteId).toBeNull();
      expect(stored.payloadEncrypted).not.toContain(person.firstName);
      expect(
        decrypt<{ person: unknown }>(stored.payloadEncrypted).person,
      ).toMatchObject(person);
      expect(
        await db.privacyRecord.findFirst({
          where: { sessionId: o.s.id, noticeVersion: PRIVACY_VERSION },
        }),
      ).not.toBeNull();
    });
    it("preserves an optional package interest without requiring or inventing a price", async () => {
      const o = await owner();
      const r = await submitContactRequest(o.s.id, {
        registrationId: o.r.id,
        interestedPackageId: packageId,
        privacyAcknowledged: true,
        noticeVersion: PRIVACY_VERSION,
      });
      contacts.push(r.id);
      const saved = await db.contactRequest.findUniqueOrThrow({
        where: { id: r.id },
      });
      const payload = decrypt<{
        interestedPackage: { id: string };
        total: null;
      }>(saved.payloadEncrypted);
      expect(payload.interestedPackage.id).toBe(packageId);
      expect(payload.total).toBeNull();
      expect(saved.quoteId).toBeNull();
    });
    it("rejects direct scheduled status and incomplete review", async () => {
      expect(
        reviewInput.safeParse({ id: "x", status: "scheduled", note: "" })
          .success,
      ).toBe(false);
      const o = await owner(),
        r = await submit(o);
      await expect(
        updateReview(marker, {
          id: r.id,
          status: "ready_to_schedule",
          note: "",
          dataReview: "",
          entitlementReview: "",
          entitlementStatus: "unverified",
        }),
      ).rejects.toThrow();
      await expect(confirmReviewedBooking(marker, r.id)).rejects.toThrow();
    });
    it("requires owner acceptance, creates a real booking while online closed, retries once and rejects full capacity", async () => {
      const o = await owner(),
        r = await submit(o);
      await ready(r.id);
      const quote = await proposeQuote(marker, r.id, packageId, []);
      await expect(
        acceptProposal((await owner()).s.id, r.id, quote.fingerprint, slotId),
      ).rejects.toThrow();
      await expect(
        acceptProposal(o.s.id, r.id, "0".repeat(64), slotId),
      ).rejects.toThrow();
      await acceptProposal(o.s.id, r.id, quote.fingerprint, slotId);
      await setBookingPolicy(marker, {
        onlineEnabled: false,
        message: "Closed for test",
      });
      const result = await Promise.all([
        confirmReviewedBooking(marker, r.id),
        confirmReviewedBooking(marker, r.id),
      ]);
      expect(result[0].id).toBe(result[1].id);
      expect(
        await db.contactRequest.findUniqueOrThrow({ where: { id: r.id } }),
      ).toMatchObject({ status: "scheduled", bookingId: result[0].id });
      expect(
        await db.invoice.count({ where: { bookingId: result[0].id } }),
      ).toBe(1);
      const next = await owner(),
        nr = await submit(next);
      await ready(nr.id);
      const nq = await proposeQuote(marker, nr.id, packageId, []);
      await acceptProposal(next.s.id, nr.id, nq.fingerprint, slotId);
      await expect(confirmReviewedBooking(marker, nr.id)).rejects.toMatchObject(
        { code: "CAPACITY_FULL" },
      );
      expect(
        await db.contactRequest.findUniqueOrThrow({ where: { id: nr.id } }),
      ).toMatchObject({ status: "ready_to_schedule", bookingId: null });
    });
    it("invalidates acceptance on price changes and expiry", async () => {
      const o = await owner(),
        r = await submit(o);
      await ready(r.id);
      let q = await proposeQuote(marker, r.id, packageId, []);
      await acceptProposal(o.s.id, r.id, q.fingerprint, slotId);
      await db.package.update({
        where: { id: packageId },
        data: { fixedPrice: "200.00" },
      });
      await expect(confirmReviewedBooking(marker, r.id)).rejects.toMatchObject({
        code: "PRICE_CHANGED",
      });
      q = await proposeQuote(marker, r.id, packageId, []);
      expect(
        (await db.contactRequest.findUniqueOrThrow({ where: { id: r.id } }))
          .acceptedAt,
      ).toBeNull();
      await db.quote.update({
        where: { id: q.id },
        data: { expiresAt: new Date(0) },
      });
      await expect(
        acceptProposal(o.s.id, r.id, q.fingerprint, slotId),
      ).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    });
    it("accepts requested information only from the verified owner and returns it for staff review", async () => {
      const o = await owner(),
        r = await submit(o);
      await updateReview(marker, {
        id: r.id,
        status: "awaiting_information",
        note: "Internal note",
        informationRequest: "Please clarify medicines",
        entitlementStatus: "unverified",
        dataReview: "",
        entitlementReview: "",
      });
      await expect(
        submitAdditionalInformation((await owner()).s.id, r.id, "No medicines"),
      ).rejects.toThrow();
      await submitAdditionalInformation(o.s.id, r.id, "No medicines");
      const saved = await db.contactRequest.findUniqueOrThrow({
        where: { id: r.id },
      });
      expect(saved.status).toBe("under_review");
      expect(saved.payloadEncrypted).not.toContain("No medicines");
      expect(
        decrypt<{ supplements: { text: string }[] }>(
          saved.payloadEncrypted,
        ).supplements.at(-1)?.text,
      ).toBe("No medicines");
      await expect(
        submitAdditionalInformation(o.s.id, r.id, "Repeated"),
      ).rejects.toThrow();
    });
    it("recovers only after verified phone plus reference and birthdate, revoking previous ownership", async () => {
      const o = await owner(),
        r = await submit(o),
        fresh = await owner();
      await expect(
        recoverInterest(fresh.s.id, r.reference, "1991-01-01"),
      ).rejects.toThrow();
      await db.session.update({
        where: { id: fresh.s.id },
        data: { verifiedPhone: null },
      });
      await expect(
        recoverInterest(fresh.s.id, r.reference, person.birthdate),
      ).rejects.toThrow();
      await db.session.update({
        where: { id: fresh.s.id },
        data: { verifiedPhone: encrypt(person.phone) },
      });
      await recoverInterest(fresh.s.id, r.reference, person.birthdate);
      expect(
        await db.contactRequest.findUniqueOrThrow({ where: { id: r.id } }),
      ).toMatchObject({ sessionId: fresh.s.id });
      expect(
        await db.registration.findUniqueOrThrow({ where: { id: o.r.id } }),
      ).toMatchObject({ ownerSessionId: fresh.s.id });
    });
  },
);
