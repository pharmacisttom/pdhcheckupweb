import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
loadEnvFile(".env");
const url = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Local test database only");
url.pathname = "/pdh_healthcheck_test";
process.env.DATABASE_URL = url.toString();
process.env.APP_URL = "http://localhost:3037";
process.env.OTP_PROVIDER = "test";
process.env.PDH_TEST_DIST_DIR ??= ".local/next-interest";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "interest-workflow.spec.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://localhost:3037",
    actionTimeout: 20000,
    navigationTimeout: 30000,
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --turbopack --hostname=localhost --port=3037",
    url: "http://localhost:3037",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
