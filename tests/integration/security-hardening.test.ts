import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { matchingOperatorTotpStep, operatorTotp } from "../../src/lib/mfa";
import { consumeTotpStep } from "../../src/server/services/totp-replay";
import { pruneSecurityEvents, recordSecurityEvent } from "../../src/server/services/security-events";
import { privateHash } from "../../src/lib/security";

describe.skipIf(process.env.RUN_DB_TESTS !== "true")("MFA replay and security-event persistence", () => {
  const userId = `security-${crypto.randomUUID()}`;
  afterAll(async () => {
    await db.securityEvent.deleteMany({ where: { subjectHash: privateHash(`${userId}-synthetic-subject`) } });
    await db.totpStepUse.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("consumes one login step once, including concurrent requests, with separate step-up purpose", async () => {
    await db.user.create({ data: { id: userId, email: `${userId}@example.invalid`, passwordHash: "synthetic", role: "manager", name: "Synthetic Security Test" } });
    const now = 1_800_000;
    const proof = operatorTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").generate({ timestamp: now });
    const step = matchingOperatorTotpStep("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", proof, now);
    expect(step).not.toBeNull();
    const parallel = await Promise.all(Array.from({ length: 8 }, () => consumeTotpStep(userId, "login", step!)));
    expect(parallel.filter(Boolean)).toHaveLength(1);
    expect(await consumeTotpStep(userId, "login", step!)).toBe(false);
    expect(await consumeTotpStep(userId, "privileged-step-up", step!)).toBe(true);
  });

  it("does not consume on invalid proof and keeps failure events outside a rolled-back transaction", async () => {
    const now = 1_800_000;
    expect(matchingOperatorTotpStep("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "000000", now)).toBeNull();
    const proof = operatorTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").generate({ timestamp: now });
    const step = matchingOperatorTotpStep("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", proof, now)!;
    expect(await consumeTotpStep(userId, "login", step)).toBe(false);

    await recordSecurityEvent("login.failure", `${userId}-synthetic-subject`, "auth/login", new Date("2026-11-15T00:00:00Z"));
    await expect(db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { name: "rolled back" } });
      throw new Error("synthetic rollback");
    })).rejects.toThrow("synthetic rollback");
    expect(await db.securityEvent.count({ where: { eventType: "login.failure", subjectHash: privateHash(`${userId}-synthetic-subject`), routeGroup: "auth/login" } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).name).toBe("Synthetic Security Test");
  });

  it("retains events for 90 days and removes expired replay counters", async () => {
    const old = new Date(Date.now() - 100 * 86400000);
    const subjectHash = privateHash(`${userId}-old-subject`);
    await db.securityEvent.create({ data: {
      dedupKey: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
      eventType: "authorization.denied",
      subjectHash,
      routeGroup: "admin/users",
      windowStartedAt: old,
      lastSeenAt: old,
      createdAt: old,
    } });
    await db.totpStepUse.create({ data: {
      userId,
      purpose: "login",
      timeStep: 123,
      consumedAt: old,
    } });
    await pruneSecurityEvents(90);
    expect(await db.securityEvent.count({ where: { subjectHash } })).toBe(0);
    expect(await db.totpStepUse.count({ where: { userId, timeStep: 123 } })).toBe(0);
  });
});
