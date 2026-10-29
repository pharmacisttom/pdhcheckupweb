import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const context = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      name === "pdh_session" && context.token
        ? { value: context.token }
        : undefined,
    set: (_n: string, v: string) => {
      context.token = v;
    },
    delete: () => {
      context.token = "";
    },
  }),
}));
import { db } from "../../src/lib/db";
import { api } from "../../src/server/api";
import { decrypt, hash } from "../../src/lib/security";
import { PRIVACY_VERSION } from "../../src/lib/intake";
import {
  updateReview,
  proposeQuote,
  acceptProposal,
} from "../../src/server/services/interest-review";
import { confirmReviewedBooking } from "../../src/server/services/appointments";
import { deliverOtp } from "../../src/server/services/otp-delivery";
const enabled = process.env.RUN_DB_TESTS === "true";
describe.skipIf(!enabled)(
  "OTP disabled: real session-owned intake and appointments",
  () => {
    const marker = crypto.randomUUID(),
      qv = Math.floor(Date.now() / 1000) + 4000;
    const sessions: string[] = [],
      registrations: string[] = [],
      contacts: string[] = [];
    let ownerToken = "",
      otherToken = "",
      packageId = "",
      slotId = "",
      dayId = "";
    let original: { onlineEnabled: boolean; message: string };
    const send = vi.fn();
    const person = {
      intakeVersion: 2,
      firstName: "NoOTP",
      lastName: marker,
      birthdate: "1990-01-01",
      sex: "unspecified",
      treatmentRight: "unknown",
      medicalHistory: "Unknown",
      surgeryHistory: "None",
      currentMedication: "None",
      allergies: "Unknown",
      familyNcdStatus: "unknown",
      phone: "0814445566",
    };
    async function call(path: string, data?: unknown) {
      const r = await api(
        new Request("http://localhost:3036/api/v1/" + path, {
          method: data === undefined ? "GET" : "POST",
          headers: {
            Origin: "http://localhost:3036",
            "Content-Type": "application/json",
          },
          ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        }),
        path.split("/"),
      );
      return { status: r.status, body: await r.json() };
    }
    beforeAll(async () => {
      const u = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1"].includes(u.hostname) ||
        u.pathname != "/pdh_healthcheck_test"
      )
        throw Error("Isolated test DB only");
      vi.stubEnv("OTP_PROVIDER", "disabled");
      vi.stubEnv("APP_URL", "http://localhost:3036");
      vi.stubGlobal("fetch", send);
      original = await db.bookingPolicy.findUniqueOrThrow({
        where: { id: "default" },
      });
      await db.bookingPolicy.update({
        where: { id: "default" },
        data: { onlineEnabled: true },
      });
      await db.questionnaire.create({
        data: {
          version: qv,
          status: "published",
          approvedBy: marker,
          questions: [],
          rules: [],
        },
      });
      packageId = (
        await db.package.create({
          data: {
            key: marker,
            version: 1,
            name: "No OTP synthetic package",
            description: "Test",
            audience: "Test",
            preparation: "Test",
            fixedPrice: "100.00",
            status: "published",
            approvedBy: marker,
            effectiveFrom: new Date("2020-01-01"),
          },
        })
      ).id;
      const when = new Date(Date.now() + 150 * 86400000);
      dayId = when.toISOString().slice(0, 10);
      await db.dayCapacity.create({ data: { id: dayId, capacity: 2 } });
      slotId = (
        await db.slot.create({
          data: {
            dayId,
            startsAt: when,
            endsAt: new Date(when.getTime() + 3600000),
            capacity: 2,
          },
        })
      ).id;
      const guest = await call("auth/guest", {});
      expect(guest.body.data).toMatchObject({
        verified: false,
        otpRequired: false,
      });
      ownerToken = context.token;
      const owner = await db.session.findUniqueOrThrow({
        where: { tokenHash: hash(ownerToken) },
      });
      sessions.push(owner.id);
      context.token = "";
      await call("auth/guest", {});
      otherToken = context.token;
      sessions.push(
        (
          await db.session.findUniqueOrThrow({
            where: { tokenHash: hash(otherToken) },
          })
        ).id,
      );
      context.token = ownerToken;
    });
    afterAll(async () => {
      const bs = await db.booking.findMany({
          where: { registrationId: { in: registrations } },
        }),
        bids = bs.map((b) => b.id);
      const rs = await db.registration.findMany({
        where: { id: { in: registrations } },
      });
      await db.invoice.deleteMany({ where: { bookingId: { in: bids } } });
      await db.notification.deleteMany({
        where: { dedupKey: { in: bids.map((id) => id + ":confirmed") } },
      });
      await db.booking.deleteMany({ where: { id: { in: bids } } });
      await db.contactRequest.deleteMany({ where: { id: { in: contacts } } });
      await db.registration.deleteMany({
        where: { id: { in: registrations } },
      });
      await db.patient.deleteMany({
        where: {
          id: { in: rs.flatMap((r) => (r.patientId ? [r.patientId] : [])) },
        },
      });
      await db.quote.deleteMany({ where: { sessionId: { in: sessions } } });
      await db.hold.deleteMany({ where: { sessionId: { in: sessions } } });
      await db.privacyRecord.deleteMany({
        where: { sessionId: { in: sessions } },
      });
      await db.audit.deleteMany({
        where: { OR: [{ actorId: marker }, { actorId: { in: sessions } }] },
      });
      await db.session.deleteMany({ where: { id: { in: sessions } } });
      if (slotId) await db.slot.delete({ where: { id: slotId } });
      if (dayId) await db.dayCapacity.delete({ where: { id: dayId } });
      if (packageId) await db.package.delete({ where: { id: packageId } });
      await db.questionnaire.deleteMany({ where: { version: qv } });
      if (original)
        await db.bookingPolicy.update({
          where: { id: "default" },
          data: {
            onlineEnabled: original.onlineEnabled,
            message: original.message,
          },
        });
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await db.$disconnect();
    });
    it("blocks request, verify and recovery endpoints and never sends or creates OTP", async () => {
      for (const [path, data] of [
        ["otp/request", { phone: person.phone }],
        ["otp/verify", { verificationId: "none", code: "123456" }],
        [
          "contact-requests/recover",
          { reference: "none", birthdate: person.birthdate },
        ],
      ] as const) {
        const r = await call(path, data);
        expect(r.status).toBe(503);
        expect(r.body.error.code).toBe("OTP_DISABLED");
      }
      await expect(deliverOtp("+66814445566", "123456")).rejects.toMatchObject({
        code: "OTP_DISABLED",
      });
      expect(send).not.toHaveBeenCalled();
      expect(
        await db.verification.count({ where: { sessionId: { in: sessions } } }),
      ).toBe(0);
    });
    it("recomputes reused answers server-side and rejects rule-dependent or unknown bindings", async () => {
      context.token = ownerToken;
      await db.questionnaire.update({
        where: { version: qv },
        data: {
          questions: [
            { id: "allergy", label: "ประวัติแพ้ยา (ถ้ามี)", type: "text" },
          ],
        },
      });
      try {
        const response = await call("registrations", {
          person: { ...person, allergies: "Synthetic shared allergy" },
          answers: { allergy: "Untrusted stale response" },
          reuseIntakeAnswers: ["allergy"],
          questionnaireVersion: qv,
        });
        expect(response.status).toBe(200);
        registrations.push(response.body.data.id);
        const stored = await db.registration.findUniqueOrThrow({
          where: { id: response.body.data.id },
        });
        expect(
          decrypt<Record<string, string>>(stored.assessmentEncrypted!).allergy,
        ).toBe("Synthetic shared allergy");
        expect(
          (
            await call("registrations", {
              person,
              answers: {},
              reuseIntakeAnswers: ["not_approved"],
              questionnaireVersion: qv,
            })
          ).status,
        ).toBe(422);
        await db.questionnaire.update({
          where: { version: qv },
          data: {
            rules: [
              {
                id: "protected",
                field: "allergy",
                equals: "yes",
                decision: "needs_clinical_review",
                reason: "Synthetic approved rule",
              },
            ],
          },
        });
        expect(
          (
            await call("registrations", {
              person,
              answers: {},
              reuseIntakeAnswers: ["allergy"],
              questionnaireVersion: qv,
            })
          ).status,
        ).toBe(422);
        // Old clients do not opt into reuse; their independent answers remain unchanged.
        const legacy = await call("registrations", {
          person,
          answers: { allergy: "Independent legacy response" },
          questionnaireVersion: qv,
        });
        expect(legacy.status).toBe(200);
        registrations.push(legacy.body.data.id);
        const old = await db.registration.findUniqueOrThrow({
          where: { id: legacy.body.data.id },
        });
        expect(
          decrypt<Record<string, string>>(old.assessmentEncrypted!).allergy,
        ).toBe("Independent legacy response");
      } finally {
        await db.questionnaire.update({
          where: { version: qv },
          data: { questions: [], rules: [] },
        });
      }
    });
    it("submits interest without OTP, preserves unverified status, enforces ownership and permits staff booking", async () => {
      const reg = await call("registrations", {
        person,
        answers: {},
        questionnaireVersion: qv,
      });
      expect(reg.status).toBe(200);
      registrations.push(reg.body.data.id);
      const submitted = await call("contact-requests", {
        registrationId: reg.body.data.id,
        privacyAcknowledged: true,
        noticeVersion: PRIVACY_VERSION,
      });
      expect(submitted.status).toBe(200);
      const id = submitted.body.data.id;
      contacts.push(id);
      const row = await db.contactRequest.findUniqueOrThrow({ where: { id } });
      expect(
        decrypt<{ contactVerification: string }>(row.payloadEncrypted)
          .contactVerification,
      ).toBe("staff_pending");
      expect(
        (await db.session.findUniqueOrThrow({ where: { id: sessions[0] } }))
          .verifiedPhone,
      ).toBeNull();
      context.token = otherToken;
      expect((await call("contact-requests")).body.data).toEqual([]);
      expect(
        (
          await call("contact-requests", {
            registrationId: reg.body.data.id,
            privacyAcknowledged: true,
          })
        ).status,
      ).toBe(404);
      context.token = ownerToken;
      await updateReview(marker, {
        id,
        status: "under_review",
        note: "Phone requires staff verification",
        entitlementStatus: "pending",
        dataReview: "",
        entitlementReview: "",
      });
      await updateReview(marker, {
        id,
        status: "ready_to_schedule",
        note: "Staff contacted patient",
        entitlementStatus: "unable_to_verify",
        dataReview: "Staff verified contact manually",
        entitlementReview: "Self-pay discussed",
      });
      const quote = await proposeQuote(marker, id, packageId, []);
      await acceptProposal(sessions[0], id, quote.fingerprint, slotId);
      const b = await confirmReviewedBooking(marker, id);
      expect(b.reference).toMatch(/^PDH-/);
      expect(
        (await db.contactRequest.findUniqueOrThrow({ where: { id } }))
          .bookingId,
      ).toBe(b.id);
      expect(send).not.toHaveBeenCalled();
    });
    it("keeps online booking working for the owning unverified session without setting verifiedPhone", async () => {
      const reg = await call("registrations", {
        person: { ...person, firstName: "Other", birthdate: "1991-01-01" },
        answers: {},
        questionnaireVersion: qv,
      });
      expect(reg.status).toBe(200);
      registrations.push(reg.body.data.id);
      const q = await call("quotes", { packageId, addonIds: [] });
      expect(q.status).toBe(200);
      const h = await call("holds", { slotId });
      expect(h.status).toBe(200);
      const result = await call("bookings", {
        registrationId: reg.body.data.id,
        quoteId: q.body.data.id,
        fingerprint: q.body.data.fingerprint,
        holdId: h.body.data.id,
        idempotencyKey: crypto.randomUUID(),
        privacyAcknowledged: true,
        noticeVersion: PRIVACY_VERSION,
      });
      expect(result.status).toBe(200);
      expect(
        (await db.session.findUniqueOrThrow({ where: { id: sessions[0] } }))
          .verifiedPhone,
      ).toBeNull();
      expect(send).not.toHaveBeenCalled();
    });
  },
);
