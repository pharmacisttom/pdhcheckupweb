import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("staging pinned-SHA deployment script safety", () => {
  const scriptPath = join(process.cwd(), "deploy", "staging", "deploy-pinned-sha.sh");
  const script = readFileSync(scriptPath, "utf8");

  it("enforces staging-only isolation and refuses production", () => {
    expect(script).toContain("export DEPLOY_ENV=staging");
    expect(script).toContain("127.0.0.1:pdh_healthcheck_staging:pdhcheckup_stg");
    expect(script).toContain("https://pdhcheckup.pluakdaenghospital.cloud");
    expect(script).toContain("require_env");
    expect(script).toContain("lock_environment");
  });

  it("never performs destructive git resets, checkout mutations, or UAT auto-seeding", () => {
    expect(script).not.toMatch(/git\s+reset\s+--hard/);
    expect(script).not.toMatch(/git\s+checkout/);
    expect(script).not.toContain("seed-uat-staging");
    expect(script).not.toContain("SEED_DEMO=true");
  });

  it("uses isolated bare cache, immutable git archive release, digest gate, backup, rollback pointer, and healthcheck", () => {
    expect(script).toContain("--preflight-only");
    expect(script).toContain("git init --bare");
    expect(script).toContain('git -C "$GIT_CACHE" archive "$SHA"');
    expect(script).toContain("APPROVED_MIGRATIONS_SHA256");
    expect(script).toContain('bash "$TOOLS/backup.sh"');
    expect(script).toContain("previous.next");
    expect(script).toContain('bash "$TOOLS/healthcheck.sh"');
    expect(script).toContain("PROD_PID_BEFORE");
    expect(script).toContain("PROD_PID_AFTER");
    expect(script).toContain("SOURCE_HEAD_BEFORE");
    expect(script).toContain("SOURCE_HEAD_AFTER");
  });
});
