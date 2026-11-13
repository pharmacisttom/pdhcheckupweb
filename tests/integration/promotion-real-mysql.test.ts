import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPromotion } from "../../scripts/promote-config-data";

describe.skipIf(process.env.RUN_DB_TESTS !== "true")("promotion against isolated MySQL", () => {
  let admin: PrismaClient, source: PrismaClient, target: PrismaClient;
  let directory: string;
  const names = ["pdh_promotion_source_test", "pdh_promotion_target_test"];
  const created: string[] = [];
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/pdh_healthcheck_test") {
      throw new Error("Isolated localhost test DB required");
    }
    admin = new PrismaClient();
    const urls: string[] = [];
    for (const name of names) {
      // CREATE deliberately fails if an unrelated database already exists.
      await admin.$executeRawUnsafe(`CREATE DATABASE ${name}`);
      created.push(name);
      url.pathname = "/" + name;
      urls.push(url.toString());
      const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8",
      });
      if (result.status !== 0) throw new Error("Promotion test schema setup failed");
    }
    source = new PrismaClient({ datasources: { db: { url: urls[0] } } });
    target = new PrismaClient({ datasources: { db: { url: urls[1] } } });
    vi.stubEnv("SOURCE_DATABASE_URL", urls[0]);
    vi.stubEnv("TARGET_DATABASE_URL", urls[1]);
    vi.stubEnv("ALLOW_TEST_DATABASES", "true");
    directory = mkdtempSync(join(tmpdir(), "pdh-promotion-"));
    await source.service.create({ data: { code: "MED-RC03", nameTh: "รายการทดสอบ", nameEn: "Panel", category: "lab", componentCodes: [] } });
  }, 60000);
  afterAll(async () => {
    await source?.$disconnect();
    await target?.$disconnect();
    // Cleanup only these exact synthetic databases; no environment-derived SQL.
    if (admin) {
      for (const name of created) await admin.$executeRawUnsafe(`DROP DATABASE ${name}`);
      await admin.$disconnect();
    }
    if (directory) rmSync(directory, { recursive: true });
    vi.unstubAllEnvs();
  });
  async function prepare() {
    const options = { dryRun: true, apply: false, promoteApprovedPrices: false, includeUatServices: false, manifestFile: join(directory, "manifest.json") };
    const result = await runPromotion(options);
    return { ...options, dryRun: false, apply: true, manifestChecksum: result.manifestChecksum };
  }
  it("dry-run writes zero rows; approved apply persists and audits", async () => {
    const options = await prepare();
    expect(await target.service.count()).toBe(0);
    expect(await target.audit.count()).toBe(0);
    await runPromotion(options);
    expect(await target.service.count()).toBe(1);
    expect(await target.audit.count({ where: { action: "data.promotion_applied" } })).toBe(1);
  });
  it("same-count edits invalidate approval without overwriting its file", async () => {
    const options = await prepare();
    const bytes = readFileSync(options.manifestFile, "utf8");
    await target.service.update({ where: { code: "MED-RC03" }, data: { nameEn: "Changed" } });
    await expect(runPromotion(options)).rejects.toThrow(/changed since PREPARE/);
    expect(readFileSync(options.manifestFile, "utf8")).toBe(bytes);
  });
  it("an audit failure rolls back real preceding InnoDB writes", async () => {
    await source.service.create({ data: { code: "MED-ROLLBACK", nameTh: "รายการทดสอบ", nameEn: "Panel", category: "lab", componentCodes: [] } });
    await target.audit.deleteMany();
    await target.$executeRawUnsafe("ALTER TABLE Audit ADD CONSTRAINT rc03_reject_audit CHECK (action <> 'data.promotion_applied')");
    try {
      const options = await prepare();
      await expect(runPromotion(options)).rejects.toThrow();
      expect(await target.service.findUnique({ where: { code: "MED-ROLLBACK" } })).toBeNull();
      expect((await target.service.findUniqueOrThrow({ where: { code: "MED-RC03" } })).nameEn).toBe("Changed");
    } finally {
      await target.$executeRawUnsafe("ALTER TABLE Audit DROP CHECK rc03_reject_audit");
    }
  });
  it("preserves reserved capacity and live holds, and rejects closing an occupied slot", async () => {
    const startsAt = new Date("2098-01-01T01:00:00Z");
    const endsAt = new Date("2098-01-01T02:00:00Z");
    for (const client of [source, target]) {
      await client.dayCapacity.create({ data: { id: "2098-01-01", capacity: 10 } });
      await client.slot.create({ data: {
        dayId: "2098-01-01", startsAt, endsAt,
        capacity: client === source ? 2 : 10,
        reservedCapacity: client === source ? 0 : 4,
      } });
    }
    const slot = await target.slot.findUniqueOrThrow({ where: { startsAt } });
    const hold = await target.hold.create({ data: { sessionId: "synthetic", slotId: slot.id, expiresAt: new Date("2098-01-01") } });
    await runPromotion(await prepare());
    const saved = await target.slot.findUniqueOrThrow({ where: { startsAt } });
    expect(saved.reservedCapacity).toBe(4);
    expect(saved.capacity).toBeGreaterThanOrEqual(4);
    expect(await target.hold.findUnique({ where: { id: hold.id } })).not.toBeNull();
    await source.slot.update({ where: { startsAt }, data: { closed: true } });
    await expect(prepare()).rejects.toThrow(/Cannot close/);
    expect((await target.slot.findUniqueOrThrow({ where: { startsAt } })).closed).toBe(false);
  });
});
