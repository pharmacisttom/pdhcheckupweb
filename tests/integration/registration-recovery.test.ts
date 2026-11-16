import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { verifyRc02TestDatabase } from "../../scripts/test-db-guard.mjs";
import { encrypt, hash } from "../../src/lib/security";
import { recoverRegistrationDraft } from "../../src/server/services/recover-registration";

const integration = process.env.RUN_DB_TESTS === "true" ? describe : describe.skip;
const db = new PrismaClient();
const id = randomUUID();
let ownerSessionId = "";
let newSessionId = "";
let registrationId = "";

integration("RC02 durable registration and secure cross-session recovery (isolated database)", () => {
  beforeAll(async () => {
    // Fail closed before ANY database write or synthetic fixture creation.
    await verifyRc02TestDatabase(db, process.env.DATABASE_URL ?? "");
    ownerSessionId = (await db.session.create({
      data: {
        tokenHash: hash("rc02-original-" + id),
        expiresAt: new Date(Date.now() - 86400000),
      },
    })).id;
    newSessionId = (await db.session.create({
      data: {
        tokenHash: hash("rc02-recovered-" + id),
        verifiedPhone: encrypt("+66812345678"),
        expiresAt: new Date(Date.now() + 3600000),
      },
    })).id;
    registrationId = (await db.registration.create({
      data: {
        ownerSessionId,
        draftEncrypted: encrypt({
          firstName: "Synthetic",
          lastName: "Recovery",
          birthdate: "1990-01-01",
          phone: "+66812345678",
        }),
        assessmentEncrypted: encrypt({}),
        questionnaireVersion: 1,
        expiresAt: new Date(Date.now() - 86400000),
      },
    })).id;
  });

  afterAll(async () => {
    // Clean up only fixtures created by this test, never preexisting records.
    if (registrationId) {
      await db.audit.deleteMany({
        where: { resourceId: registrationId, action: "registration.draft_recovered" },
      });
      await db.registration.deleteMany({ where: { id: registrationId } });
    }
    await db.session.deleteMany({ where: { id: { in: [ownerSessionId, newSessionId].filter(Boolean) } } });
    await db.$disconnect();
  });

  it("does not recover with an incorrect birthdate and leaves original owner intact", async () => {
    await expect(recoverRegistrationDraft(newSessionId, registrationId, "1990-02-01"))
      .rejects.toMatchObject({ status: 404 });
    const registration = await db.registration.findUniqueOrThrow({
      where: { id: registrationId },
    });
    expect(registration.ownerSessionId).toBe(ownerSessionId);
  });

  it("recovers an expired draft into verified new session without deleting or booking it", async () => {
    const countBefore = await db.registration.count();
    const recovered = await recoverRegistrationDraft(newSessionId, registrationId, "1990-01-01");
    expect(recovered).toEqual({ recovered: true });
    expect((await db.registration.findUniqueOrThrow({
      where: { id: registrationId },
    })).ownerSessionId).toBe(newSessionId);
    expect(await db.registration.count()).toBe(countBefore);
    expect(await db.booking.count({ where: { registrationId } })).toBe(0);
  });
});
