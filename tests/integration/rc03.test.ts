import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      name === "pdh_session" ? { value: context.token } : undefined,
  }),
}));
import { db } from "../../src/lib/db";
import { api } from "../../src/server/api";
import { encrypt, decrypt, hash } from "../../src/lib/security";
import { verifyRc02TestDatabase } from "../../scripts/test-db-guard.mjs";
import { proposeRc03Questionnaire } from "../../src/lib/rc03-questionnaire";

describe.skipIf(process.env.RUN_DB_TESTS !== "true")(
  "RC03 guarded persistence and access",
  () => {
    const marker = crypto.randomUUID();
    const tokens = {
      owner: "rc03-owner-" + marker,
      stranger: "rc03-other-" + marker,
      staff: "rc03-staff-" + marker,
    };
    const sessions: string[] = [],
      registrations: string[] = [];
    let verifiedDatabase = false;
    let staffId = "",
      organizationId = "",
      contactId = "",
      version = 0,
      registrationId = "";
    const person = {
      intakeVersion: 3,
      firstName: "Synthetic",
      lastName: "RC03",
      birthdate: "1991-11-24",
      phone: "0812345678",
      heightCm: 170,
      weightKg: 70,
      sex: "unspecified",
      treatmentRight: "unknown",
      medicalHistory: "None",
      surgeryHistory: "None",
      currentMedication: "None",
      allergies: "None",
      familyNcdStatus: "yes",
      familyNcdEntries: [
        { relationship: "mother", disease: "diabetes" },
        { relationship: "father", disease: "stroke" },
      ],
    };
    async function call(path: string, input?: unknown) {
      const url = new URL("http://localhost:3037/api/v1/" + path);
      const response = await api(
        new Request(url, {
          method: input === undefined ? "GET" : "POST",
          headers: { Origin: url.origin, "Content-Type": "application/json" },
          ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        }),
        url.pathname.replace("/api/v1/", "").split("/"),
      );
      return { status: response.status, body: await response.json() };
    }
    beforeAll(async () => {
      await verifyRc02TestDatabase(db, process.env.DATABASE_URL ?? "");
      verifiedDatabase = true;
      staffId = (
        await db.user.create({
          data: {
            email: marker + "@rc03.invalid",
            name: "Synthetic",
            role: "superadmin",
            passwordHash: "synthetic",
            mfaSecret: encrypt("synthetic"),
          },
        })
      ).id;
      for (const [role, token] of Object.entries(tokens))
        sessions.push(
          (
            await db.session.create({
              data: {
                tokenHash: hash(token),
                ...(role === "staff" ? { userId: staffId } : {}),
                verifiedPhone: encrypt("+66812345678"),
                expiresAt: new Date(Date.now() + 3600000),
              },
            })
          ).id,
        );
      organizationId = (
        await db.organization.create({
          data: {
            name: "RC03 synthetic " + marker,
            contactEncrypted: encrypt("Synthetic"),
            status: "active",
          },
        })
      ).id;
      version =
        ((await db.questionnaire.findFirst({ orderBy: { version: "desc" } }))
          ?.version ?? 0) + 1;
      const proposal = proposeRc03Questionnaire([], []);
      await db.questionnaire.create({
        data: {
          version,
          questions: proposal.questions,
          rules: [],
          status: "published",
          approvedBy: staffId,
        },
      });
      context.token = tokens.owner;
    });
    afterAll(async () => {
      if (!verifiedDatabase) {
        await db.$disconnect();
        return;
      }
      if (contactId)
        await db.contactRequest.deleteMany({ where: { id: contactId } });
      if (registrations.length)
        await db.registration.deleteMany({
          where: { id: { in: registrations } },
        });
      if (version) await db.questionnaire.deleteMany({ where: { version } });
      if (organizationId)
        await db.organization.deleteMany({ where: { id: organizationId } });
      if (sessions.length) {
        await db.rateLimit.deleteMany({
          where: { OR: sessions.map((id) => ({ key: { contains: id } })) },
        });
        await db.session.deleteMany({ where: { id: { in: sessions } } });
      }
      await db.audit.deleteMany({
        where: {
          OR: [
            { actorId: staffId || marker },
            ...sessions.map((actorId) => ({ actorId })),
          ],
        },
      });
      if (staffId) await db.user.deleteMany({ where: { id: staffId } });
      await db.$disconnect();
    });
    it("rejects missing measurements for new records even with historical payload shape", async () => {
      const result = await call("registrations", {
        person: {
          firstName: "Synthetic",
          lastName: "Legacy",
          birthdate: person.birthdate,
          phone: person.phone,
        },
        answers: {},
        questionnaireVersion: version,
      });
      expect(result.status).toBe(422);
    });
    it("saves and updates the same encrypted group registration without a booking", async () => {
      const input = {
        requestId: crypto.randomUUID(),
        person: {
          ...person,
          registrationMode: "group",
          group: {
            organizationId,
            primaryContact: "Synthetic Coordinator",
            contactPhone: "0812345678",
          },
        },
        answers: { snoring_history: "unknown" },
        questionnaireVersion: version,
      };
      const saved = await call("registrations", input);
      expect(saved.status).toBe(200);
      registrationId = saved.body.data.id;
      registrations.push(registrationId);
      const parallel = await Promise.all([
        call("registrations", input),
        call("registrations", input),
      ]);
      expect(parallel.map((r) => r.body.data.id)).toEqual([
        registrationId,
        registrationId,
      ]);
      const replay = await call("registrations", input);
      expect(replay.status).toBe(200);
      expect(replay.body.data.id).toBe(registrationId);
      expect(
        await db.registration.count({ where: { ownerSessionId: sessions[0] } }),
      ).toBe(1);
      const updated = await call("registrations", {
        ...input,
        id: registrationId,
        answers: { snoring_history: "yes" },
      });
      expect(updated.status).toBe(200);
      expect(updated.body.data.id).toBe(registrationId);
      const row = await db.registration.findUniqueOrThrow({
        where: { id: registrationId },
      });
      expect(row.organizationId).toBe(organizationId);
      expect(row.draftEncrypted).not.toContain("Synthetic Coordinator");
      expect(decrypt(row.draftEncrypted)).toMatchObject({
        heightCm: 170,
        weightKg: 70,
        familyNcdEntries: person.familyNcdEntries,
      });
      expect(decrypt(row.assessmentEncrypted!)).toEqual({
        snoring_history: "yes",
      });
      expect(await db.booking.count({ where: { registrationId } })).toBe(0);
    });
    it("does not expose another member's draft or allow updating it", async () => {
      context.token = tokens.stranger;
      expect((await call("registrations/draft")).body.data).toBeNull();
      expect(
        (
          await call("registrations", {
            id: registrationId,
            person,
            answers: {},
            questionnaireVersion: version,
          })
        ).status,
      ).toBe(404);
      context.token = tokens.owner;
      expect((await call("registrations/draft")).body.data).toMatchObject({
        id: registrationId,
        questionnaireVersion: version,
        answers: { snoring_history: "yes" },
      });
    });
    it("rejects inactive organizations without creating a registration", async () => {
      await db.organization.update({
        where: { id: organizationId },
        data: { status: "inactive" },
      });
      const result = await call("registrations", {
        person: {
          ...person,
          registrationMode: "group",
          group: {
            organizationId,
            primaryContact: "Synthetic",
            contactPhone: "0812345678",
          },
        },
        answers: {},
        questionnaireVersion: version,
      });
      expect(result.status).toBe(422);
    });
    it("paginates metadata only, gates detail and audits authorized disclosure", async () => {
      contactId = (
        await db.contactRequest.create({
          data: {
            reference: "RC03-" + marker.slice(0, 20),
            registrationId,
            sessionId: sessions[0],
            status: "submitted",
            payloadEncrypted: encrypt({
              person,
              questionnaireVersion: version,
              answers: { snoring_history: "yes" },
            }),
          },
        })
      ).id;
      context.token = tokens.stranger;
      expect(
        (await call("admin/contact-requests/detail?id=" + contactId)).status,
      ).toBe(403);
      context.token = tokens.staff;
      const list = await call(
        "admin/contact-requests?search=RC03-" +
          marker.slice(0, 20) +
          "&pageSize=1",
      );
      expect(list.status).toBe(200);
      expect(list.body.data.total).toBe(1);
      expect(list.body.data.rows[0]).not.toHaveProperty("details");
      expect(JSON.stringify(list.body)).not.toContain("snoring_history");
      expect(
        (
          await call(
            "admin/contact-requests?search=RC03-" +
              marker.slice(0, 20) +
              "&pageSize=1&page=2",
          )
        ).body.data.rows,
      ).toEqual([]);
      await db.user.update({
        where: { id: staffId },
        data: { role: "clinician" },
      });
      expect(
        (await call("admin/contact-requests/detail?id=" + contactId)).status,
      ).toBe(403);
      await db.user.update({
        where: { id: staffId },
        data: { role: "superadmin" },
      });
      const detail = await call(
        "admin/contact-requests/detail?id=" + contactId,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.data.details.answers).toEqual({
        snoring_history: "yes",
      });
      expect(
        await db.audit.count({
          where: {
            actorId: staffId,
            resourceId: contactId,
            action: "contact_request.detail_viewed",
          },
        }),
      ).toBe(1);
    });
  },
);
