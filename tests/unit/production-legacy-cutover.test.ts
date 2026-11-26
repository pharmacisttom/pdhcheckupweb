import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("production legacy-compatible cutover and rollback scripts", () => {
  const cutoverPath = join(
    process.cwd(),
    "deploy",
    "production",
    "cutover-legacy-pinned-sha.sh",
  );
  const rollbackPath = join(
    process.cwd(),
    "deploy",
    "production",
    "rollback-legacy-cutover.sh",
  );
  const backupPath = join(process.cwd(), "deploy", "shared", "backup.sh");

  const cutover = readFileSync(cutoverPath, "utf8");
  const rollback = readFileSync(rollbackPath, "utf8");
  const backup = readFileSync(backupPath, "utf8");

  it("enforces production-only isolation, confirmation gates, and exact remote branch tip", () => {
    expect(cutover).toContain("export DEPLOY_ENV=production");
    expect(cutover).toContain("127.0.0.1:pdh_healthcheck:pdhcheckup_prod");
    expect(cutover).toContain("https://pdhcheckup.pluakdaenghospital.cloud");
    expect(cutover).toContain("CONFIRM_PRODUCTION_CUTOVER");
    expect(cutover).toContain("--preflight-only");
    expect(cutover).toContain("APPROVED_MIGRATIONS_SHA256");
    expect(cutover).toContain('BRANCH_TIP=$(git -C "$GIT_CACHE" rev-parse "refs/remotes/origin/$BRANCH")');
    expect(cutover).toContain('[[ $BRANCH_TIP == "$SHA" ]]');
    expect(cutover).not.toContain("merge-base --is-ancestor");
  });

  it("never resets source, seeds data, runs destructive SQL, or auto-restores DB", () => {
    for (const content of [cutover, rollback]) {
      expect(content).not.toMatch(/git\s+reset\s+--hard/);
      expect(content).not.toMatch(/git\s+checkout/);
      expect(content).not.toContain("seed-uat-staging");
      expect(content).not.toContain("prisma migrate reset");
      expect(content).not.toContain("prisma db push");
      expect(content).not.toContain("DROP DATABASE");
      expect(content).not.toContain("TRUNCATE");
      expect(content).not.toMatch(/mysql[^|\n]*</);
      expect(content).not.toContain("rollback-state.env");
      expect(content).not.toMatch(/source\s+.*rollback-state/);
      expect(content).not.toMatch(/sha256sum[^|\n]*\|\|\s*true/);
    }
  });

  it("uses validated JSON rollback state, deterministic backup provenance, drop-ins, and signal traps", () => {
    expect(backup).toContain("BACKUP_FILE=");
    expect(backup).toContain("BACKUP_SHA256_FILE=");
    expect(cutover).not.toContain("ls -1t");
    expect(cutover).toContain("BACKUP_START_EPOCH");
    expect(cutover).toContain("rollback-state.json");
    expect(cutover).toContain("rollback-state.json.sha256");
    expect(cutover).toContain("dropins.orig");
    expect(cutover).toContain("dropins.sha256");
    expect(cutover).toContain("ACTIVATION_STARTED=true");
    expect(cutover).toContain("ACTIVATION_COMMITTED=true");
    expect(cutover).toContain("ROLLBACK_DONE=true");
    expect(cutover).toContain("trap 'on_signal INT' INT");
    expect(cutover).toContain("trap 'on_signal TERM' TERM");
    expect(cutover).toContain("trap 'on_exit' EXIT");
    expect(cutover).toContain("verify_restored_legacy_runtime");
  });

  it("verifies checksums fail-closed and restored legacy runtime in manual rollback", () => {
    expect(rollback).toContain("export DEPLOY_ENV=production");
    expect(rollback).toContain("--preflight");
    expect(rollback).toContain("--restore-legacy");
    expect(rollback).toContain("SCHEMA_COMPATIBILITY_REVIEWED");
    expect(rollback).toContain("CONFIRM_PRODUCTION_ROLLBACK");
    expect(rollback).toContain("sha256sum -c rollback-state.json.sha256");
    expect(rollback).toContain("sha256sum -c pdhcheckup-production.service.orig.sha256");
    expect(rollback).toContain("sha256sum -c ../dropins.sha256");
    expect(rollback).toContain("RESTORED_WORKDIR");
    expect(rollback).toContain("sudo systemctl daemon-reload");
  });
});
