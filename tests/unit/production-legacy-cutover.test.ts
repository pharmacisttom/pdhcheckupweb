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
  const serviceExamplePath = join(
    process.cwd(),
    "deploy",
    "production",
    "pdhcheckup-production.service.example",
  );

  const cutover = readFileSync(cutoverPath, "utf8");
  const rollback = readFileSync(rollbackPath, "utf8");
  const serviceExample = readFileSync(serviceExamplePath, "utf8");

  it("enforces production-only isolation, confirmation gates, and preflight-only support", () => {
    expect(cutover).toContain("export DEPLOY_ENV=production");
    expect(cutover).toContain("127.0.0.1:pdh_healthcheck:pdhcheckup_prod");
    expect(cutover).toContain("https://pdhcheckup.pluakdaenghospital.cloud");
    expect(cutover).toContain("CONFIRM_PRODUCTION_CUTOVER");
    expect(cutover).toContain("--preflight-only");
    expect(cutover).toContain("APPROVED_MIGRATIONS_SHA256");
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
    }
  });

  it("builds immutable release, fixes pdhcheckup ownership, removes runtime .env, backs up DB and systemd unit", () => {
    expect(cutover).toContain('git -C "$GIT_CACHE" archive "$SHA"');
    expect(cutover).toContain("chown -R pdhcheckup:pdhcheckup");
    expect(cutover).toContain("rm -f -- runtime/.env runtime/.env.production runtime/.env.local runtime/.env.staging");
    expect(cutover).toContain('bash "$TOOLS/backup.sh"');
    expect(cutover).toContain("sha256sum -c");
    expect(cutover).toContain("verify_production_db_state");
    expect(cutover).toContain("pdhcheckup-production.service.orig");
    expect(cutover).toContain("sudo systemctl daemon-reload");
    expect(cutover).toContain("rollback_application_only");
    expect(cutover).toContain("/api/v1/health");
    expect(cutover).toContain("/api/v1/admin/audit");
    expect(cutover).toContain("STAGING_PID_BEFORE");
    expect(cutover).toContain("STAGING_PID_AFTER");
  });

  it("provides preflight and checksum-verified application-only rollback aligned with systemd service example", () => {
    expect(rollback).toContain("export DEPLOY_ENV=production");
    expect(rollback).toContain("--preflight");
    expect(rollback).toContain("--restore-legacy");
    expect(rollback).toContain("SCHEMA_COMPATIBILITY_REVIEWED");
    expect(rollback).toContain("CONFIRM_PRODUCTION_ROLLBACK");
    expect(rollback).toContain("sha256sum -c pdhcheckup-production.service.orig.sha256");
    expect(rollback).toContain("sudo systemctl daemon-reload");
    expect(serviceExample).toContain("WorkingDirectory=/var/www/pdhcheckup/releases/production/current/runtime");
    expect(serviceExample).toContain("Environment=PORT=3036");
    expect(serviceExample).toContain("ExecStart=/usr/bin/node server.js");
  });
});
