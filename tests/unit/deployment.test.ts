import { describe, it, expect } from "vitest";
// Deployment's executable validator is also tested without filesystem or VPS access.
// @ts-expect-error The deployment CLI is intentionally native Node ESM.
import { validateSettings } from "../../deploy/shared/validate-env.mjs";
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
