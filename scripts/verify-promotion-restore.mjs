import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const index = arg.indexOf("=");
  if (!arg.startsWith("--") || index < 0) throw Error("Use --key=value arguments");
  return [arg.slice(2, index), arg.slice(index + 1)];
}));
const required = key => {
  if (!args[key]) throw Error(`Missing --${key}=value`);
  return args[key];
};
const digest = value => createHash("sha256").update(value).digest("hex");

if (args["check-receipt"]) {
  const receipt = JSON.parse(readFileSync(args["check-receipt"], "utf8"));
  if (receipt.version !== 1 || receipt.verified !== true || receipt.database !== "pdh_healthcheck_restore_rc03" ||
      receipt.backupSha256 !== required("backup-sha") || receipt.manifestSha256 !== required("manifest-checksum") ||
      receipt.commit !== required("commit") || receipt.orphanRows !== 0 ||
      !Number.isFinite(Date.parse(receipt.verifiedAt)) ||
      Date.now() - Date.parse(receipt.verifiedAt) < 0 || Date.now() - Date.parse(receipt.verifiedAt) > 24 * 3600000) {
    throw Error("Missing, stale or mismatched isolated-restore verification receipt");
  }
  console.log("Isolated restore receipt matches backup, manifest and release");
} else {
  const url = new URL(process.env.RESTORE_DATABASE_URL ?? "mysql://invalid/invalid");
  if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/pdh_healthcheck_restore_rc03") {
    throw Error("Read-only restore verification requires the isolated local pdh_healthcheck_restore_rc03 database");
  }
  const commit = required("commit");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error("Exact release SHA required");
  const backup = required("backup");
  execFileSync("gzip", ["-t", "--", backup]);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(backup)) hash.update(chunk);
  const manifestBytes = readFileSync(required("manifest"));
  const manifest = JSON.parse(manifestBytes.toString());
  const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const identity = await client.$queryRaw`SELECT DATABASE() AS databaseName, @@server_uuid AS serverUuid`;
    if (identity[0]?.databaseName !== "pdh_healthcheck_restore_rc03") throw Error("Restore database identity mismatch");
    const counts = {};
    const models = { questionnaires: "questionnaire", services: "service", prices: "price", packages: "package", packageItems: "packageItem", dayCapacities: "dayCapacity", slots: "slot", bookings: "booking", patients: "patient", registrations: "registration", holds: "hold", quotes: "quote", users: "user", sessions: "session", bookingPolicies: "bookingPolicy" };
    for (const [key, model] of Object.entries(models)) {
      counts[key] = await client[model].count();
      if (counts[key] !== manifest.targetBaselineState?.[key]) throw Error(`Restore count differs from PREPARE baseline: ${key}; freeze writes and repeat backup/PREPARE`);
    }
    const orphan = await client.$queryRaw`SELECT
      (SELECT COUNT(*) FROM PackageItem i LEFT JOIN Package p ON p.id=i.packageId LEFT JOIN Service s ON s.id=i.serviceId WHERE p.id IS NULL OR s.id IS NULL) +
      (SELECT COUNT(*) FROM Price p LEFT JOIN Service s ON s.id=p.serviceId WHERE s.id IS NULL) +
      (SELECT COUNT(*) FROM Slot s LEFT JOIN DayCapacity d ON d.id=s.dayId WHERE d.id IS NULL) +
      (SELECT COUNT(*) FROM Hold h LEFT JOIN Slot s ON s.id=h.slotId WHERE s.id IS NULL) +
      (SELECT COUNT(*) FROM Booking b LEFT JOIN Slot s ON s.id=b.slotId LEFT JOIN Registration r ON r.id=b.registrationId LEFT JOIN Quote q ON q.id=b.quoteId WHERE s.id IS NULL OR r.id IS NULL OR q.id IS NULL)
      AS orphanRows`;
    if (Number(orphan[0]?.orphanRows) !== 0) throw Error("Restored database has unresolved references");
    const applied = await client.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations`;
    const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", commit, "prisma/migrations"], { encoding: "utf8" }).trim().split("\n").filter(path => path.endsWith("/migration.sql"));
    for (const path of paths) {
      const name = path.split("/").at(-2);
      const checksum = digest(execFileSync("git", ["show", `${commit}:${path}`]));
      if (!applied.some(row => row.migration_name === name && row.checksum === checksum && row.finished_at && !row.rolled_back_at)) throw Error(`Restored migration is absent or differs from release: ${name}`);
    }
    if (applied.some(row => !row.finished_at && !row.rolled_back_at)) throw Error("Restore contains an unfinished migration");
    const receipt = { version: 1, verified: true, verifiedAt: new Date().toISOString(), database: identity[0].databaseName, serverUuid: identity[0].serverUuid, commit, backupSha256: hash.digest("hex"), manifestSha256: digest(manifestBytes), counts, orphanRows: 0, migrationFilesVerified: paths.length };
    writeFileSync(required("receipt"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log("Isolated restore verified; receipt created. No production database was opened or modified.");
  } finally {
    await client.$disconnect();
  }
}
