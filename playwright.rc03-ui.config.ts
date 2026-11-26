import { defineConfig } from "@playwright/test";
// UI-only regression: all API traffic is intercepted with synthetic responses.
// A closed port prevents accidental real database access; this is not DB E2E evidence.
process.env.DATABASE_URL =
  "mysql://pdh_test:UiOnlySynthetic@127.0.0.1:1/pdh_healthcheck_rc01_test";
process.env.APP_URL = "http://localhost:3047";
process.env.PDH_TEST_DIST_DIR = ".next";
process.env.PDH_TEST_UI_MOCKS = "true";
process.env.PORT = "3047";
process.env.HOSTNAME = "localhost";
process.env.OTP_PROVIDER = "disabled";
process.env.EMAIL_PROVIDER = "disabled";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "rc03-ui.spec.ts",
    "registration-mobile.spec.ts",
    "rc04-impeccable-visual.spec.ts",
  ],
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://localhost:3047",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/start-browser-e2e.mjs",
    url: "http://localhost:3047",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
