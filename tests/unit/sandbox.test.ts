import { describe, expect, it } from "vitest";
import { sandboxEnabled } from "../../src/lib/sandbox";
const env = { PDH_SANDBOX_MODE: "true", DATABASE_URL: "mysql://synthetic:synthetic@127.0.0.1:33319/pdh_healthcheck_sandbox", OTP_PROVIDER: "disabled", EMAIL_PROVIDER: "disabled", CHAT_AI_ENABLED: "false" };
describe("isolated executable prototype", () => {
  it("is absent from ordinary production configuration", () => expect(sandboxEnabled({})).toBe(false));
  it("accepts only the dedicated synthetic database", () => expect(sandboxEnabled(env)).toBe(true));
  it.each(["pdh_healthcheck", "pdh_healthcheck_staging", "pdh_healthcheck_test"])("rejects %s", name => {
    expect(() => sandboxEnabled({ ...env, DATABASE_URL: env.DATABASE_URL.replace("pdh_healthcheck_sandbox", name) })).toThrow(/isolated/);
  });
  it("rejects external hosts and notification or AI providers", () => {
    for (const change of [{ DATABASE_URL: env.DATABASE_URL.replace("127.0.0.1", "example.com") }, { OTP_PROVIDER: "test" }, { EMAIL_PROVIDER: "smtp" }, { CHAT_AI_ENABLED: "true" }]) {
      expect(() => sandboxEnabled({ ...env, ...change })).toThrow(/isolated/);
    }
  });
});
