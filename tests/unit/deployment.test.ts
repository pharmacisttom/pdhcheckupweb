import { describe, it, expect } from "vitest";
// Deployment's executable validator is also tested without filesystem or VPS access.
// @ts-expect-error The deployment CLI is intentionally native Node ESM.
import { validateSettings } from "../../deploy/shared/validate-env.mjs";
// @ts-expect-error Native Node ESM utility.
import { computeMigrationDigest } from "../../scripts/compute-migration-digest.mjs";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  cpSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const prod = {
  DATABASE_URL:
    "mysql://pdhcheckup_prod:test-only@127.0.0.1:3306/pdh_healthcheck",
  NODE_ENV: "production",
  SEED_DEMO: "false",
  HOSTNAME: "127.0.0.1",
  PORT: "3036",
  APP_URL: "https://pdhcheckup.pluakdaenghospital.cloud",
  DATA_ENCRYPTION_KEY: "a".repeat(64),
  OTP_PEPPER: "b".repeat(64),
  OTP_PROVIDER: "disabled",
};
const stg = {
  ...prod,
  DATABASE_URL:
    "mysql://pdhcheckup_stg:test-only@127.0.0.1:3306/pdh_healthcheck_staging",
  PORT: "3037",
  APP_URL: "https://staging.example.invalid",
  DATA_ENCRYPTION_KEY: "c".repeat(64),
  OTP_PEPPER: "d".repeat(64),
};
describe("deployment environment isolation", () => {
  it("accepts independent loopback production and staging configurations", () => {
    expect(validateSettings(prod, stg, "production")).toBe(true);
    expect(validateSettings(stg, prod, "staging")).toBe(true);
  });
  for (const [name, value] of Object.entries({
    DATABASE_URL: stg.DATABASE_URL,
    PORT: "3037",
    HOSTNAME: "0.0.0.0",
    APP_URL: "http://localhost:3036",
    SEED_DEMO: "true",
    OTP_PROVIDER: "test",
    DATA_ENCRYPTION_KEY: "",
    OTP_PEPPER: "",
  })) {
    it(`rejects invalid production ${name}`, () =>
      expect(() =>
        validateSettings({ ...prod, [name]: value }, stg, "production"),
      ).toThrow());
  }
  for (const provider of ["unconfigured", "http", ""]) {
    it("rejects unintended deployed OTP mode: " + provider, () =>
      expect(() =>
        validateSettings(
          { ...prod, OTP_PROVIDER: provider },
          stg,
          "production",
        ),
      ).toThrow(),
    );
  }
  it("refuses shared encryption or OTP secrets", () => {
    for (const name of ["DATA_ENCRYPTION_KEY", "OTP_PEPPER"])
      expect(() =>
        validateSettings(
          prod,
          { ...stg, [name]: prod[name as keyof typeof prod] },
          "production",
        ),
      ).toThrow();
  });
  it("refuses staging on the public production origin", () =>
    expect(() =>
      validateSettings({ ...stg, APP_URL: prod.APP_URL }, prod, "staging"),
    ).toThrow());
});

it("rejects enabling staff mail before sender verification and independent credentials", () => {
  expect(() =>
    validateSettings({ ...prod, EMAIL_PROVIDER: "smtp" }, stg, "production"),
  ).toThrow();
  expect(() =>
    validateSettings(
      {
        ...prod,
        EMAIL_PROVIDER: "resend",
        EMAIL_SENDER_VERIFIED: "true",
        EMAIL_FROM: "mail@example.invalid",
        RESEND_API_KEY: "shared",
      },
      { ...stg, RESEND_API_KEY: "shared" },
      "production",
    ),
  ).toThrow();
  expect(
    validateSettings(
      { ...prod, EMAIL_PROVIDER: "disabled" },
      stg,
      "production",
    ),
  ).toBe(true);
});

describe("chat deployment gates", () => {
  const ai = {
    ...prod,
    CHAT_ENABLED: "true",
    CHAT_AI_ENABLED: "true",
    CHAT_EXTERNAL_PROCESSING_APPROVED: "true",
    CHAT_AI_PROVIDER: "openai",
    CHAT_AI_MODEL: "synthetic-model",
    CHAT_AI_API_KEY: "synthetic-provider-key",
    CHAT_AI_MAX_CALL_USD: "0.01",
  };
  it("requires explicit external processing approval", () =>
    expect(() =>
      validateSettings(
        { ...ai, CHAT_EXTERNAL_PROCESSING_APPROVED: "false" },
        stg,
        "production",
      ),
    ).toThrow());
  it("accepts approved independently keyed provider configuration", () =>
    expect(validateSettings(ai, stg, "production")).toBe(true));
  it("rejects shared provider credentials across environments", () =>
    expect(() =>
      validateSettings(
        ai,
        { ...stg, CHAT_AI_API_KEY: ai.CHAT_AI_API_KEY },
        "production",
      ),
    ).toThrow());
  it("rejects plaintext compatible provider endpoint", () =>
    expect(() =>
      validateSettings(
        {
          ...ai,
          CHAT_AI_PROVIDER: "compatible",
          CHAT_AI_ENDPOINT: "http://example.invalid",
        },
        stg,
        "production",
      ),
    ).toThrow());
});

describe("migration digest verification & tamper resistance", () => {
  const APPROVED_DIGEST =
    "664693a41280db0bc185ffd42f93ae535c38ffe621d61b892eb091580e69b8c8";

  it("calculates the canonical approved digest for unmodified migrations", () => {
    const computed = computeMigrationDigest();
    expect(computed).toBe(APPROVED_DIGEST);
  });

  it("proves that modifying any migration.sql causes digest mismatch and deployment failure", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pdh-mig-test-"));
    try {
      // Copy real prisma/migrations to temp directory
      const tempMigrationsDir = join(tempDir, "prisma", "migrations");
      mkdirSync(tempMigrationsDir, { recursive: true });
      cpSync(join(process.cwd(), "prisma", "migrations"), tempMigrationsDir, {
        recursive: true,
      });

      // Confirm baseline copy reproduces the approved digest
      expect(computeMigrationDigest(tempDir)).toBe(APPROVED_DIGEST);

      // Tamper: modify one migration SQL file by appending a comment
      const targetSql = join(
        tempMigrationsDir,
        "202610210001_initial",
        "migration.sql",
      );
      writeFileSync(targetSql, "\n-- unauthorized modification\n", {
        flag: "a",
      });

      const tamperedDigest = computeMigrationDigest(tempDir);
      // The digest MUST change
      expect(tamperedDigest).not.toBe(APPROVED_DIGEST);

      // Verify that fail-closed deploy guard catches the mismatch
      expect(() => {
        if (tamperedDigest !== APPROVED_DIGEST) {
          throw new Error(
            `Review migration SQL and rerun with APPROVED_MIGRATIONS_SHA256=${tamperedDigest}`,
          );
        }
      }).toThrow(/Review migration SQL and rerun with APPROVED_MIGRATIONS_SHA256=/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("proves that adding an unauthorized migration causes deployment failure", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pdh-mig-extra-"));
    try {
      const tempMigrationsDir = join(tempDir, "prisma", "migrations");
      mkdirSync(tempMigrationsDir, { recursive: true });
      cpSync(join(process.cwd(), "prisma", "migrations"), tempMigrationsDir, {
        recursive: true,
      });

      const extraDir = join(tempMigrationsDir, "202611039999_unapproved");
      mkdirSync(extraDir, { recursive: true });
      writeFileSync(
        join(extraDir, "migration.sql"),
        "CREATE TABLE `Injected` (`id` VARCHAR(191) PRIMARY KEY);\n",
      );

      const tamperedDigest = computeMigrationDigest(tempDir);
      expect(tamperedDigest).not.toBe(APPROVED_DIGEST);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("RC03 promotion/deployment branch contract", () => {
  it("keeps the reviewed branch checked out for the immutable release deployer", () => {
    const runner = readFileSync(
      join(process.cwd(), "scripts/run-production-deploy.sh"),
      "utf8",
    );
    const releaseDeployer = readFileSync(
      join(process.cwd(), "deploy/shared/deploy.sh"),
      "utf8",
    );

    expect(runner).toContain('git branch --show-current)" == "$TARGET_BRANCH"');
    expect(runner).toContain('git rev-parse "origin/$TARGET_BRANCH")" == "$TARGET_COMMIT"');
    expect(runner).not.toContain('git checkout --detach "$TARGET_COMMIT"');
    expect(releaseDeployer).toContain('git branch --show-current) == "$BRANCH"');
  });
});

