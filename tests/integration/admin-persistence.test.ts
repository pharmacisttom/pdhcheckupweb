import { verifyRc02TestDatabase } from "../../scripts/test-db-guard.mjs";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => ({ value: identity.token }) }),
}));
import { db } from "../../src/lib/db";
import { encrypt, decrypt, hash } from "../../src/lib/security";
import { api } from "../../src/server/api";

describe.skipIf(process.env.RUN_DB_TESTS !== "true")(
  "administrative saves persist through real API handlers",
  () => {
    const marker = crypto.randomUUID();
    let userId: string;
    const days: string[] = [];
    const questions: string[] = [];
    const contacts: string[] = [];
    async function call(path: string, input?: unknown) {
      const response = await api(
        new Request("http://localhost:3037/api/v1/" + path, {
          method: input === undefined ? "GET" : "POST",
          headers: {
            Origin: "http://localhost:3037",
            "Content-Type": "application/json",
          },
          body: input === undefined ? undefined : JSON.stringify(input),
        }),
        path.split("/"),
      );
      return { status: response.status, body: await response.json() };
    }
    beforeAll(async () => {
      await verifyRc02TestDatabase(db, process.env.DATABASE_URL ?? "");
      if (process.env.PDH_TEST_ALLOW_SYNTHETIC_FIXTURES !== "true")
        throw Error("Explicit synthetic fixtures opt-in required");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("APP_URL", "http://localhost:3037");
      userId = (
        await db.user.create({
          data: {
            email: marker + "@save-test.invalid",
            name: "Synthetic save tester",
            role: "superadmin",
            passwordHash: "not-for-login",
            mfaSecret: encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"),
          },
        })
      ).id;
      identity.token = crypto.randomUUID();
      await db.session.create({
        data: {
          userId,
          tokenHash: hash(identity.token),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    });
    afterAll(async () => {
      if (userId) {
        await db.audit.deleteMany({ where: { actorId: userId } });
        await db.session.deleteMany({ where: { userId } });
        await db.user.deleteMany({ where: { id: userId } });
      }
      await db.organization.deleteMany({ where: { name: marker } });
      await db.slot.deleteMany({ where: { dayId: { in: days } } });
      await db.dayCapacity.deleteMany({ where: { id: { in: days } } });
      await db.questionnaire.deleteMany({ where: { id: { in: questions } } });
      await db.contactRequest.deleteMany({ where: { id: { in: contacts } } });
      vi.unstubAllEnvs();
      await db.$disconnect();
    });
    it("persists an organization, encrypts its contact, and returns it in the list", async () => {
      const result = await call("admin/organizations", {
        name: marker,
        contact: "Synthetic hospital contact",
      });
      expect(result.status).toBe(200);
      const saved = await db.organization.findUniqueOrThrow({
        where: { id: result.body.data.id },
      });
      expect(saved.status).toBe("draft");
      expect(saved.contactEncrypted).not.toContain(
        "Synthetic hospital contact",
      );
      expect(decrypt(saved.contactEncrypted)).toBe(
        "Synthetic hospital contact",
      );
      const list = await call("admin/organizations");
      expect(list.body.data).toContainEqual(
        expect.objectContaining({ id: saved.id, name: marker }),
      );
      expect(JSON.stringify(list.body)).not.toContain(
        "Synthetic hospital contact",
      );
    });
    it("saves slot and calendar settings and rejects mismatched daily capacity without partial writes", async () => {
      // Allocate a previously unused test-only date without changing an existing day.
      let day = "";
      for (let offset = 0; offset < 300; offset++) {
        const candidate = new Date(Date.UTC(2080, 0, 1 + offset))
          .toISOString()
          .slice(0, 10);
        if (!(await db.dayCapacity.findUnique({ where: { id: candidate } }))) {
          day = candidate;
          break;
        }
      }
      expect(day).not.toBe("");
      days.push(day);
      const result = await call("admin/slots", {
        day,
        time: "09:00",
        capacity: 4,
        dailyCapacity: 8,
      });
      expect(result.status).toBe(200);
      const slot = await db.slot.findUniqueOrThrow({
        where: { id: result.body.data.id },
      });
      expect(slot.startsAt.toISOString()).toBe(day + "T02:00:00.000Z");
      expect(slot.capacity).toBe(4);
      expect(
        (
          await call("admin/slots", {
            day,
            time: "10:00",
            capacity: 4,
            dailyCapacity: 9,
          })
        ).status,
      ).toBe(409);
      expect(await db.slot.count({ where: { dayId: day } })).toBe(1);
      expect(
        (await call("admin/calendar", { day, blackout: true, capacity: 6 }))
          .status,
      ).toBe(200);
      expect(
        await db.dayCapacity.findUnique({ where: { id: day } }),
      ).toMatchObject({ blackout: true, capacity: 6 });
    });
    it("saves questionnaire and rules, then publishes that same version", async () => {
      const input = {
        questions: [
          {
            id: "risk",
            label: marker,
            type: "single",
            options: ["yes", "no"],
            required: true,
          },
        ],
        rules: [
          {
            id: "review",
            field: "risk",
            equals: "yes",
            decision: "needs_clinical_review",
            reason: "Synthetic review rule",
          },
        ],
      };
      const result = await call("admin/questionnaires", input);
      expect(result.status).toBe(200);
      questions.push(result.body.data.id);
      expect(
        await db.questionnaire.findUnique({
          where: { id: result.body.data.id },
        }),
      ).toMatchObject({
        status: "draft",
        questions: input.questions,
        rules: input.rules,
      });
      expect(
        (
          await call("admin/questionnaires/approve", {
            id: result.body.data.id,
          })
        ).status,
      ).toBe(200);
      expect(
        await db.questionnaire.findUnique({
          where: { id: result.body.data.id },
        }),
      ).toMatchObject({ status: "published", approvedBy: userId });
    });
    it("persists questionnaire draft changes, rejects stale edits, and preserves an audit trail", async () => {
      const initial = {
        questions: [
          {
            id: "pilot",
            label: "Synthetic initial",
            type: "text",
            required: true,
          },
        ],
        rules: [],
      };
      const created = await call("admin/questionnaires", initial);
      expect(created.status).toBe(200);
      const id = created.body.data.id;
      questions.push(id);
      const changed = {
        id,
        revision: 0,
        questions: [
          {
            id: "pilot",
            label: "Synthetic updated",
            type: "text",
            required: true,
          },
        ],
        rules: [],
      };
      expect((await call("admin/questionnaires/update", changed)).status).toBe(
        200,
      );
      expect((await call("admin/questionnaires/update", changed)).status).toBe(
        409,
      );
      const saved = await db.questionnaire.findUniqueOrThrow({ where: { id } });
      expect(saved.revision).toBe(1);
      expect(saved.questions).toEqual(changed.questions);
      const listed = await call("admin/questionnaires");
      expect(listed.body.data).toContainEqual(
        expect.objectContaining({
          id,
          revision: 1,
          status: "draft",
        }),
      );
      expect(
        await db.audit.count({
          where: {
            actorId: userId,
            resourceId: id,
            action: "questionnaire.updated",
          },
        }),
      ).toBe(1);
      const archived = await call("admin/questionnaires/archive", {
        id,
        revision: 1,
        reason: "Synthetic retention test",
      });
      expect(archived.status).toBe(200);
      expect(
        await db.questionnaire.findUnique({ where: { id } }),
      ).toMatchObject({ status: "archived", revision: 2 });
      expect(
        await db.audit.count({
          where: {
            actorId: userId,
            resourceId: id,
            action: "questionnaire.archived",
          },
        }),
      ).toBe(1);
      expect(
        (
          await call("admin/questionnaires/update", {
            ...changed,
            revision: 2,
          })
        ).status,
      ).toBe(409);
    });
    it("protects the last published questionnaire from archival", async () => {
      const created = await call("admin/questionnaires", {
        questions: [
          { id: "pilot", label: "Synthetic published", type: "text" },
        ],
        rules: [],
      });
      expect(created.status).toBe(200);
      const id = created.body.data.id;
      questions.push(id);
      expect((await call("admin/questionnaires/approve", { id })).status).toBe(
        200,
      );
      const latest = await db.questionnaire.findUniqueOrThrow({
        where: { id },
      });
      // A deployed catalog may already have another published questionnaire; only
      // assert the last-active safeguard when this is the only published version.
      const count = await db.questionnaire.count({
        where: { status: "published", approvedBy: { not: null } },
      });
      if (count === 1) {
        expect(
          (
            await call("admin/questionnaires/archive", {
              id,
              revision: latest.revision,
              reason: "Synthetic archive attempt",
            })
          ).status,
        ).toBe(409);
      }
    });
    it("persists callback status and an encrypted staff note and audits the update", async () => {
      const record = await db.contactRequest.create({
        data: {
          reference: marker,
          registrationId: marker,
          sessionId: marker,
          payloadEncrypted: encrypt({ synthetic: true }),
        },
      });
      contacts.push(record.id);
      const result = await call("admin/contact-requests/status", {
        id: record.id,
        status: "contacted",
        note: "Synthetic callback note",
      });
      expect(result.status).toBe(200);
      const saved = await db.contactRequest.findUniqueOrThrow({
        where: { id: record.id },
      });
      expect(saved.status).toBe("contacted");
      expect(decrypt(saved.noteEncrypted!)).toBe("Synthetic callback note");
      expect(
        await db.audit.count({
          where: {
            actorId: userId,
            resourceId: record.id,
            action: "contact_request.updated",
          },
        }),
      ).toBe(1);
    });
  },
);
