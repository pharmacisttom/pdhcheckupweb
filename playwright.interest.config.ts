import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
loadEnvFile(".env");
const url = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Local test database only");
url.pathname = "/pdh_healthcheck_test";
process.env.DATABASE_URL = url.toString();
const port = Number(process.env.PDH_TEST_PORT ?? "3037");
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3036)
  throw Error("Invalid isolated test port");
process.env.APP_URL = `http://localhost:${port}`;
process.env.OTP_PROVIDER = "test";
process.env.PDH_TEST_DIST_DIR ??= ".local/next-interest";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "interest-workflow.spec.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    baseURL: process.env.APP_URL,
    actionTimeout: 20000,
    navigationTimeout: 30000,
  },
  webServer: {
    command:
      `node node_modules/next/dist/bin/next dev --turbopack --hostname=localhost --port=${port}`,
    url: process.env.APP_URL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
